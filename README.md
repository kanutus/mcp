# Kanutus MCP

[Model Context Protocol](https://modelcontextprotocol.io) server for [Kanutus](https://kanutus.com): meetings and calls
with live voice translation. Lets Claude, ChatGPT and your own agents create rooms, schedule meetings, book times on
booking links, list voices, read usage and transcripts, and take part in a room as an AI agent (text in, translated
voice out).

This server only talks to the public Kanutus API (`https://api.kanutus.com/v1`). It has no privileged access: it can
do exactly what the permissions you grant allow. MIT licensed.

## Use it

### Claude and ChatGPT (remote connector, OAuth)

Connector URL: **`https://mcp.kanutus.com/mcp`**

- **Claude**: Settings → Connectors → Add custom connector → name `Kanutus`, paste the URL → Connect.
- **ChatGPT**: Settings → Apps & Connectors → Advanced → enable developer mode; then Create → name `Kanutus`, paste the URL → Connect.

You sign in with your Kanutus account and choose the organization and permissions on the Kanutus consent screen.
Disconnect any time in Kanutus → Developers → Connected apps.

### Claude Desktop, Claude Code, Cursor or your agent (local, API key)

Create an API key in Kanutus → Developers (use a key just for the assistant, with a spend limit), then:

```json
{
  "mcpServers": {
    "kanutus": {
      "command": "npx",
      "args": ["-y", "@kanutus/mcp"],
      "env": { "KANUTUS_API_KEY": "kt_live_..." }
    }
  }
}
```

`kt_test_...` keys use the simulator: nothing uses minutes, test rooms have robot participants and magic phone numbers
(`+1 555 0100` answers, `+1 555 0101` busy, `+1 555 0102` voicemail, `+1 555 0199` blocked).

Optional env: `KANUTUS_API_URL` (default `https://api.kanutus.com`).

## Tools

| Tool | What it does | Hints |
| --- | --- | --- |
| `kanutus_whoami` | organization, permissions, limits, live/test | read-only |
| `get_balance`, `get_usage` | minutes left; minutes spent through the API | read-only |
| `list_rooms`, `get_room` | rooms with live translation | read-only |
| `create_room` | instant room + link | idempotent |
| `end_room` | end a room for everyone | destructive, asks to confirm |
| `create_join_link` | guest link with name and languages prefilled | |
| `list_meetings`, `schedule_meeting`, `cancel_meeting` | scheduled meetings | cancel is destructive, asks to confirm |
| `list_booking_links`, `find_slots`, `book_slot` | booking links (like Calendly) | |
| `list_voices`, `get_voice` | your voices (consented clones with their status, your own clones, generic picks) | read-only |
| `list_voice_catalog`, `choose_generic_voice` | stock voices anyone can use | |
| `create_voice` | clone a voice **with the owner's consent**: returns a link the person opens to read a consent sentence and record live (no audio upload, ever) | asks to confirm |
| `delete_voice` | revoke a cloned voice / remove a generic pick | destructive, asks to confirm |
| `list_transcripts`, `get_transcript` | transcripts this connection can read | read-only |
| `list_avatars` | published Kanutus avatars the agent can show on camera (id, name, gender, preview) | read-only |
| `join_room`, `say`, `listen`, `leave` | take part in a room as an AI agent (AI badge); `avatar_id` from `list_avatars` puts the agent on camera with that avatar (lips moved by its voice); `see_participants` + `snapshot_every_s` (5, 10, 20, 40, 60, 90, 120, 500 or 900 s, default 20) makes `listen` bring one snapshot per participant as images (camera off = `camera_on: false`, no image); everyone in the room sees a permanent notice | join asks to confirm; uses minutes; snapshots free in this version |
| `look` | a fresh snapshot of the participants' cameras and shared screens right now, as images (sessions with `see_participants`) | read-only |
| `send_chat` | write in the room chat as the agent (AI badge, translated for each reader); `listen` brings what people write as `chat.message` and `join_room` the last 50 messages as `chat_history` | free (text); 2000 chars, 1/s |
| `list_numbers` | numbers you can call from ("Call from"), the default one marked | read-only |
| `quote_call`, `start_call` | phone destination and purpose rules per country; translated call as an AI agent (`from` = number id from `list_numbers`) | start asks to confirm; always announces it is an AI |
| `get_call`, `hangup_call`, `send_dtmf` | call status, hang up, press keys (0-9, * and #) for phone menus | hang up is destructive |

Safety:

- Actions that spend minutes or reach other people ask you first (MCP elicitation). Clients without elicitation must
  pass `confirm: true`, which the assistant should only do after asking you.
- Anything said or written by other people (transcripts, room titles, names) comes back inside `untrusted_content`:
  it is data, never instructions.
- Create requests carry an idempotency key, so an assistant retrying a call never creates something twice.
- Live AI agents in rooms, voice cloning and phone calls are rolling out; with a live key they may answer "coming soon".
  Try them with a `kt_test_` key (simulator). In a room the agent always shows with the "AI agent" badge.

## Changelog

- **0.3.4** (2026-10-22): `say` returns as soon as the speech is queued; call `listen` right away and keep calling it
  while you speak (people keep talking and their words only reach you on `listen`). Joining never waits for the engines
  to warm up: the agent enters at once (badge, no voice yet), uses the chat and watches `engines`/`stage`/`eta_s`.
- **0.3.3** (2026-10-22): the agent reads and writes the room chat. `join_room` returns `chat_history` (last 50
  messages), `listen` returns a `chat.message` event per new message (text + translation to the hear language, null while
  the translator warms up) and the new `send_chat` posts in the chat as the agent ("AI agent" badge, translated for each
  reader; free; 2000 characters, one per second).
- **0.3.2** (2026-10-21): the agent's introduction is automatic and mandatory. When it joins (and again to each person
  who joins later) the room hears and reads, translated, "Hello, I am <name>, an AI agent." and, with
  `see_participants`, "Depending on the situation, I may ask you to share your camera or your screen." Free, no opt-out;
  `listen` returns `agent.introduced`. `join_room` now explains that evaluating people from what the agent sees (an
  interview, for example) needs their explicit consent beforehand and a human review (rules vary by country: EU,
  Illinois, New York, LGPD).
- **0.3.1** (2026-10-21): `list_avatars` (published avatar catalog) and `avatar_id` in `join_room`: the agent appears
  on camera with a Kanutus avatar animated by its voice; `listen` reports `face: starting | live | unavailable`.
  Agent vision: `see_participants` + `snapshot_every_s` in `join_room` (5, 10, 20, 40, 60, 90, 120, 500 or 900 s),
  snapshots of the participants' cameras and screens as image blocks in `listen`, and the new `look` tool; the room
  shows everyone a permanent notice. Nothing is stored; no charge for snapshots in this version.
- **0.3.0**: 27 languages (European Portuguese), numbers to call from (`list_numbers`, `from` in calls).

## Develop

```bash
npm install
npm test                               # SDK client against the server (in memory and Streamable HTTP + OAuth)
npm run build                          # dist/ for npm
KANUTUS_API_KEY=kt_test_... npm run stdio
npm run dev                            # remote mode on http://localhost:3011/mcp (reads .env)
```

Remote mode env: `KT_MCP_URL` (this resource, e.g. `https://mcp.kanutus.com/mcp`), `KT_API_URL`
(`https://api.kanutus.com`), `KT_MCP_CLIENT_ID` (`kanutus-mcp`) and `KT_MCP_CLIENT_SECRET` (the same value set in the
API). How it authorizes:

1. Without a token, `POST /mcp` answers 401 with `WWW-Authenticate: Bearer resource_metadata=".../.well-known/oauth-protected-resource/mcp"`.
2. That metadata names the Kanutus authorization server (`https://api.kanutus.com`, RFC 8414 metadata, PKCE S256,
   Dynamic Client Registration). The person consents at `https://app.kanutus.com/oauth/authorize`.
3. The client sends the token (audience = this MCP). The server checks it against the API JWKS and exchanges it
   (RFC 8693) for an API token with the same permissions. The user's token is never forwarded.

## Deploy (Vercel)

Project `kanutus-mcp`, root = this folder (or the root of the `kanutus/mcp` repo). `api/index.ts` handles every route
(`vercel.json` rewrite). Env: the four variables above with `NODE_ENV=production`. Domain `mcp.kanutus.com`.

## Publish to npm

```bash
npm run build && npm publish --access public
```

The `kanutus/mcp` public repository is exported from the Kanutus monorepo by `scripts/kanutus-publish.sh mcp`.
