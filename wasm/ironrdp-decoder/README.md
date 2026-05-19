# ironrdp-decoder (wasm)

Browser-side IronRDP decoder used by the PAM RDP session replay player. Reuses
upstream IronRDP's frame decoders + `ActiveStage` so playback matches a live
session's rendering.

Consumed by `frontend/src/pages/pam/PamSessionsByIDPage/components/RdpReplayView/`
via the generated bindings at `frontend/src/lib/ironrdp-decoder/`.

## Building

Requires a working Rust toolchain and [`wasm-pack`](https://rustwasm.github.io/wasm-pack/installer/):

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

Build + emit bindings into the frontend:

```sh
cd wasm/ironrdp-decoder
make build
```

The Makefile passes `--remap-path-prefix=$HOME=build` so the committed `.wasm` doesn't embed your home directory (which includes your username).

## When to rebuild

Whenever `src/lib.rs` or `Cargo.toml` (incl. IronRDP version bumps) changes.
The bindings under `frontend/src/lib/ironrdp-decoder/` are committed today
so the frontend build works without a Rust toolchain. Regeneration is manual
until CI runs `wasm-pack build` and either commits-on-bump or publishes the
artifact for the frontend build to pull.

## Layout

- `Cargo.toml` — keep IronRDP versions in lockstep with the gateway bridge
  (`infisical/cli` repo, `packages/pam/handlers/rdp/native/Cargo.toml`).
- `src/lib.rs` — `wasm-bindgen` entry points for the player (`new`, `feed`,
  `move_pointer`, `dirty_rect`, `buffer_ptr`, etc.). Single file by design;
  the surface is intentionally small.
