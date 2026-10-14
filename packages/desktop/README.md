# Desktop end (Electron)

The desktop client is a native window that runs the **same standalone server** as the
web client and loads the **same web UI**. There is no second UI to maintain.

## Run

```sh
cd packages/desktop
npm install        # downloads Electron (heavy; needs its own install)
npm start
```

`main.cjs` spawns `npx tsx packages/server/src/index.ts` from the repository root, waits
for `/api/health`, then opens a window on `http://127.0.0.1:8787`.

## Notes

- Set `PORT` to change the port; the shell and the server read the same value.
- Electron is intentionally **not** a root workspace dependency so the shared install
  stays light. Install it only when you need the desktop end.
