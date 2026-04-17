# Vendored: ironrdp-web

Pre-built WASM artifacts from the [IronRDP](https://github.com/Devolutions/IronRDP)
project, specifically the `ironrdp-web` crate compiled via
`cargo xtask web build`.

Apache-2.0 OR MIT licensed (see the upstream crate).

## Why vendored

Devolutions does not publish `ironrdp-web` to npm. Their wrapper
`iron-remote-desktop-rdp` is marked `"private": true`. Rather than fork
and maintain a publish pipeline, we vendor the compiled output directly.

## How to refresh

```
cd /path/to/IronRDP
cargo xtask web build
cp crates/ironrdp-web/pkg/{ironrdp_web.js,ironrdp_web.d.ts,ironrdp_web_bg.wasm,ironrdp_web_bg.wasm.d.ts,package.json} \
   /path/to/infisical/frontend/src/lib/ironrdp-web/
```

Pin the exact upstream commit whenever you refresh; note it in the commit
message so future refreshes can diff.

## Consumption

Vite's `vite-plugin-wasm` + `vite-plugin-top-level-await` plugins (already
configured in `vite.config.ts`) pick this up automatically. Import from
`@app/lib/ironrdp-web/ironrdp_web`.

Minimum consumption:

```ts
import wasmInit, { SessionBuilder, setup } from "@app/lib/ironrdp-web/ironrdp_web";

await wasmInit();
setup("info");

const builder = new SessionBuilder();
builder
  .username("Administrator")
  .password("...")
  .destination("target-host:3389")
  .proxyAddress("wss://.../ws-endpoint")  // RDCleanPath-capable proxy
  .authToken("ticket-or-jwt")
  .renderCanvas(canvasEl);

const session = await builder.connect();
await session.run();
```

## Important: RDCleanPath requirement

The WASM client connects to the proxy via **RDCleanPath** — a Devolutions
protocol that wraps RDP in a small ASN.1 handshake over WebSocket. See
`/Users/berniegandin/Repos/IronRDP/crates/ironrdp-rdcleanpath/` for the
Rust reference implementation.

This means our backend WebSocket endpoint can't just forward raw bytes;
it has to speak RDCleanPath on the browser side and translate to raw RDP
on the gateway side.

Currently scaffolded only. See `rdp-poc-e2e.md` for the remaining work.
