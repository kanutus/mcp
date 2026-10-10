#!/usr/bin/env node
/**
 * Local Kanutus MCP over stdio (Claude Desktop/Code, Cursor, your own agents):
 *   KANUTUS_API_KEY=kt_live_... npx -y @kanutus/mcp
 * Optional: KANUTUS_API_URL (default https://api.kanutus.com).
 */
import { createHash } from "node:crypto";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { KanutusClient } from "./client.js";
import { createKanutusServer, VERSION } from "./server.js";

const key = process.env.KANUTUS_API_KEY?.trim();
if (!key || !/^kt_(live|test)_/.test(key)) {
  console.error("Set KANUTUS_API_KEY to a Kanutus API key (kt_live_... or kt_test_...). Create one in Kanutus > Developers.");
  process.exit(1);
}
const baseUrl = process.env.KANUTUS_API_URL?.trim() || "https://api.kanutus.com";
const client = new KanutusClient({ baseUrl, token: () => key, userAgent: `kanutus-mcp/${VERSION} (stdio)` });
const server = createKanutusServer({ client, credentialScope: createHash("sha256").update(key).digest("hex").slice(0, 16) });
await server.connect(new StdioServerTransport());
