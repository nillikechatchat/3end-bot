# 3end-bot

A standalone multi-bot team with **three clients**: desktop, web and mobile. One shared
team, one backend, three ways in. It is fully self-contained — no dependency on any other
project and no external services beyond an OpenAI-compatible model endpoint you provide.

It takes its ideas from [DS Bot](https://github.com/Fei2411/DeepSeek-Bot): a main bot
that runs the team, bots with their own roles and memory, and group chats where the admin
answers by default and `@Name` hands work to a member.

## Layout

```text
3end-bot/
  packages/
    core/       Bot engine: team store, @-mention parsing, group rounds, memory, LLM client
    server/     Standalone backend (native http): REST API + serves the built web client
    web/        Browser client (Vite + React)
    desktop/    Electron shell that starts the server and loads the web UI
    mobile/     Expo / React Native client that talks to the same server
  scripts/dev.mjs   runs server + Vite together
  .env.example      model + port + data dir
```

## Quick start (web + server)

```sh
npm install
npm start          # server on http://127.0.0.1:8787 (serves the built web client)
npm run build      # build the web client into packages/web/dist (run once before start)
```

For a live-reload loop:

```sh
npm run dev        # Vite on :5173 (HMR) + the server on :8787
```

Open the printed URL. With no API key the server answers in **mock mode**, so the whole
flow runs before you configure anything. To use a real model, copy `.env.example` to
`.env` and fill in `USER_LLM_BASE_URL`, `USER_LLM_API_KEY` and `USER_LLM_MODEL`.

## The three endpoints

| End | What it is | How to run |
| --- | --- | --- |
| **Web** | Browser client, one of the two dev-time entries | `npm run dev`, or `npm start` after `npm run build` |
| **Desktop** | Electron window that boots the server and loads the web UI | `cd packages/desktop && npm install && npm start` |
| **Mobile** | Expo / React Native client over the same HTTP API | `cd packages/mobile && npm install && npm start` |

Desktop and mobile are intentionally kept out of the root workspace so the shared install
stays light (Electron and React Native are heavy). Install them only when needed.

## How it works

Every bot is a long-lived participant with a name, role, instructions and optional model.
A group chat is one shared ordered conversation: the admin answers by default, `@Name`
hands the turn to a member, and a bot with nothing to add replies `[PASS]` and stays quiet.
Memory is plain Markdown (a team scope and a per-bot scope); entries that look like a
secret are refused. The engine lives in `packages/core`; the clients only render.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the module map and the API surface.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/state` | bots, groups, model status |
| POST | `/api/bots` | create a bot |
| PATCH / DELETE | `/api/bots/:id` | update / delete a bot |
| POST | `/api/groups` | create a group chat |
| DELETE | `/api/groups/:id` | delete a group |
| GET | `/api/rooms/:roomId/messages` | room history (`roomId` = group id or `dm:<botId>`) |
| POST | `/api/rooms/:roomId/messages` | send a message, run a turn, return the log |
| GET / POST | `/api/memory` | read / add a memory entry (`scope=team` or a bot id) |
| GET | `/api/health` | liveness + data dir |

## Model configuration

Copy `.env.example` to `.env`:

```sh
USER_LLM_BASE_URL=https://api.openai.com/v1
USER_LLM_API_KEY=your-api-key-here
USER_LLM_MODEL=gpt-4o-mini
```

Any provider that speaks the OpenAI `/chat/completions` shape works. Your key stays in
`.env` (git-ignored) and is only sent from the server to that endpoint.

## Data

Team state is saved to `data/state.json`; memory to `data/memory/`. Change the location
with `DATA_DIR`. Room history is kept in memory for the current session.

## License

Apache-2.0.
