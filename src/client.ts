/**
 * Cliente mínimo da API pública da Kanutus (https://api.kanutus.com/v1). O MCP só fala com a API pública: nenhum
 * acesso privilegiado. Credencial: chave de API (`kt_live_…`/`kt_test_…`, modo local) ou o token trocado pelo
 * servidor remoto (RFC 8693).
 */
export class KanutusError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export interface KanutusClientOptions {
  baseUrl: string;
  /** devolve o Bearer a usar (pode trocar token) */
  token: () => Promise<string> | string;
  fetch?: typeof fetch;
  userAgent?: string;
}

export class KanutusClient {
  constructor(private readonly o: KanutusClientOptions) {}

  async request<T = any>(method: "GET" | "POST" | "DELETE" | "PATCH", path: string, body?: unknown, opts: { idempotencyKey?: string; query?: Record<string, string | number | undefined> } = {}): Promise<T> {
    const url = new URL(`${this.o.baseUrl.replace(/\/+$/, "")}${path}`);
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    const headers: Record<string, string> = {
      authorization: `Bearer ${await this.o.token()}`,
      accept: "application/json",
      "user-agent": this.o.userAgent ?? "kanutus-mcp",
      "kanutus-client": "mcp",
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;
    const res = await (this.o.fetch ?? fetch)(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(40_000) });
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { message: text };
    }
    if (!res.ok) throw new KanutusError(res.status, String(data?.code ?? data?.error ?? "error"), String(data?.message ?? data?.error_description ?? `HTTP ${res.status}`));
    return data as T;
  }
}
