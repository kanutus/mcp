/**
 * Remote Kanutus MCP (https://mcp.kanutus.com/mcp): Streamable HTTP, stateless (a new server per request), OAuth 2.1
 * through the Kanutus authorization server, following the MCP authorization spec:
 *  - 401 + `WWW-Authenticate: Bearer resource_metadata=...` without a valid token;
 *  - `/.well-known/oauth-protected-resource[/mcp]` points to the Kanutus authorization server;
 *  - the user's token (audience = this MCP) is NEVER passed through: it is exchanged (RFC 8693) for an API token with
 *    the same permissions, using this server's own client credentials.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { KanutusClient } from "./client.js";
import { createKanutusServer, VERSION } from "./server.js";

export interface RemoteConfig {
  /** this resource, e.g. https://mcp.kanutus.com/mcp */
  mcpUrl: string;
  /** Kanutus API = issuer, e.g. https://api.kanutus.com */
  apiUrl: string;
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
  jwks?: JWTVerifyGetKey;
}

export function remoteConfigFromEnv(env: Record<string, string | undefined> = process.env): RemoteConfig {
  const prod = env.NODE_ENV === "production";
  const secret = env.KT_MCP_CLIENT_SECRET?.trim();
  if (!secret) throw new Error("KT_MCP_CLIENT_SECRET is required for the remote MCP server");
  return {
    mcpUrl: (env.KT_MCP_URL || (prod ? "https://mcp.kanutus.com/mcp" : "http://localhost:3011/mcp")).replace(/\/+$/, ""),
    apiUrl: (env.KT_API_URL || (prod ? "https://api.kanutus.com" : "http://localhost:3010")).replace(/\/+$/, ""),
    clientId: env.KT_MCP_CLIENT_ID?.trim() || "kanutus-mcp",
    clientSecret: secret,
  };
}

const SCOPES = ["account:read", "usage:read", "rooms:read", "rooms:write", "rooms:join", "calendar:read", "calendar:write", "booking:write", "voices:read", "transcripts:read", "calls:read", "calls:dial"];

export function createRemoteHandler(cfg: RemoteConfig) {
  const f = cfg.fetch ?? fetch;
  const jwks = cfg.jwks ?? createRemoteJWKSet(new URL(`${cfg.apiUrl}/.well-known/jwks.json`));
  const exchanged = new Map<string, { token: string; exp: number }>();
  const mcpPath = new URL(cfg.mcpUrl).pathname;
  const origin = new URL(cfg.mcpUrl).origin;
  const resourceMeta = {
    resource: cfg.mcpUrl,
    authorization_servers: [cfg.apiUrl],
    bearer_methods_supported: ["header"],
    scopes_supported: SCOPES,
    resource_name: "Kanutus",
    resource_documentation: "https://kanutus.com/developers",
  };
  const metaUrl = `${origin}/.well-known/oauth-protected-resource${mcpPath}`;

  const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...headers });
    res.end(JSON.stringify(body));
  };
  const unauthorized = (res: ServerResponse, error?: string) =>
    send(res, 401, { error: error ?? "unauthorized", error_description: "Connect your Kanutus account" }, {
      "WWW-Authenticate": `Bearer resource_metadata="${metaUrl}"${error ? `, error="${error}"` : ""}`,
      "access-control-expose-headers": "WWW-Authenticate",
    });

  async function exchange(userToken: string): Promise<string> {
    const k = createHash("sha256").update(userToken).digest("hex");
    const hit = exchanged.get(k);
    if (hit && hit.exp > Date.now() + 30_000) return hit.token;
    const basic = Buffer.from(`${encodeURIComponent(cfg.clientId)}:${encodeURIComponent(cfg.clientSecret)}`).toString("base64");
    const r = await f(`${cfg.apiUrl}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${basic}` },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
        subject_token: userToken,
        subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
        resource: cfg.apiUrl,
      }).toString(),
    });
    const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
    if (!r.ok || !j.access_token) throw Object.assign(new Error(j.error ?? "exchange_failed"), { status: r.status });
    if (exchanged.size > 5000) exchanged.clear();
    exchanged.set(k, { token: j.access_token, exp: Date.now() + (j.expires_in ?? 60) * 1000 });
    return j.access_token;
  }

  async function readJson(req: IncomingMessage): Promise<unknown> {
    const pre = (req as IncomingMessage & { body?: unknown }).body;
    if (pre !== undefined) return pre;
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const text = Buffer.concat(chunks).toString("utf8");
    return text ? JSON.parse(text) : undefined;
  }

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", origin);
    const path = url.pathname;
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id",
        "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
      });
      res.end();
      return;
    }
    if (path.startsWith("/.well-known/oauth-protected-resource")) return send(res, 200, resourceMeta, { "access-control-allow-origin": "*" });
    if (path.startsWith("/.well-known/oauth-authorization-server") || path.startsWith("/.well-known/openid-configuration")) {
      const r = await f(`${cfg.apiUrl}/.well-known/oauth-authorization-server`);
      return send(res, r.status, await r.json(), { "access-control-allow-origin": "*" });
    }
    if (path === "/" || path === "/health") return send(res, 200, { name: "Kanutus MCP", version: VERSION, mcp: cfg.mcpUrl });
    if (path !== mcpPath) return send(res, 404, { error: "not_found" });

    const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? "");
    if (!m) return unauthorized(res);
    const userToken = m[1]!;
    let sub: string;
    try {
      const { payload } = await jwtVerify(userToken, jwks, { issuer: cfg.apiUrl, audience: cfg.mcpUrl, algorithms: ["ES256"] });
      sub = String(payload.gid ?? payload.sub);
    } catch {
      return unauthorized(res, "invalid_token");
    }
    let apiToken: string;
    try {
      apiToken = await exchange(userToken);
    } catch (e) {
      if ((e as { status?: number }).status === 503) return send(res, 503, { error: "temporarily_unavailable", error_description: "The Kanutus connector is temporarily disabled." });
      return unauthorized(res, "invalid_token");
    }
    if (req.method !== "POST") {
      return send(res, 405, { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed (stateless server: use POST)" }, id: null }, { allow: "POST" });
    }
    const client = new KanutusClient({ baseUrl: cfg.apiUrl, token: () => apiToken, fetch: f, userAgent: `kanutus-mcp/${VERSION} (remote)` });
    const server = createKanutusServer({ client, credentialScope: sub });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, await readJson(req));
  };
}
