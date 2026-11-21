# SignalMesh

Monorepo for the SignalMesh web and mobile apps.

```
apps/web         Next.js website
apps/mobile      Expo (React Native) app
packages/shared  Code used by both apps (types, API client, utils)
```

## Setup

```bash
npm install
```

## Development

```bash
npm run dev          # web + mobile together
npm run dev:web      # web only  → http://localhost:3000
npm run dev:mobile   # mobile only (Expo; press i for iOS, a for Android)
```

## Shared code

Import from either app:

```ts
import { greet } from "@signalmesh/shared";
```
