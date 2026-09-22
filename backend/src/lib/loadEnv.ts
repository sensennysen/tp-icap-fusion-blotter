import { config } from 'dotenv';

// .env lives at the repo root, not backend/. Must be imported as the very
// first line of every entrypoint (server.ts, seed.ts) — ES module execution
// order runs each import's full subtree before the next sibling import, so
// this side effect only lands ahead of config/env.ts if nothing is imported
// before it.
config({ path: '../.env' });
