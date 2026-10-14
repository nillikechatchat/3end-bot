# Mobile end (Expo / React Native)

The mobile client is a thin view over the **same standalone server** as web and desktop.
It has no bot logic of its own: it lists the team, streams room history and posts messages
to `/api/rooms/:id/messages`.

## Run

```sh
cd packages/mobile
npm install        # Expo + React Native (heavy; needs its own install)
npm start          # then press a / i, or scan the QR with Expo Go
```

## Pointing at the server

The phone and the server must be on the same network. Set the server address before
starting Expo:

```sh
EXPO_PUBLIC_API_URL=http://192.168.1.20:8787 npm start
```

`127.0.0.1` only works for a simulator on the same machine.
