/** Local remote-mode server: `pnpm --filter @kanutus/mcp dev` -> http://localhost:3011/mcp */
import { createServer } from "node:http";
import { createRemoteHandler, remoteConfigFromEnv } from "./remote.js";

const cfg = remoteConfigFromEnv();
const handle = createRemoteHandler(cfg);
const port = Number(process.env.PORT || new URL(cfg.mcpUrl).port || 3011);
createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error("[mcp]", e);
    if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "internal_error" }));
  });
}).listen(port, () => console.log(`Kanutus MCP at ${cfg.mcpUrl} (API ${cfg.apiUrl})`));
