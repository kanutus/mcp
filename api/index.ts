/** Vercel (project kanutus-mcp, Root Directory apps/mcp or the kanutus/mcp repo root): every route lands here (vercel.json). */
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRemoteHandler, remoteConfigFromEnv } from "../src/remote.js";

const handle = createRemoteHandler(remoteConfigFromEnv());

export default function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return handle(req, res);
}
