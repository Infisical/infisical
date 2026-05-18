# CLAUDE.md

WASM decoder for the PAM RDP replay player. Consumed by `frontend/src/pages/pam/PamSessionsByIDPage/components/RdpReplayView/` through generated bindings in `frontend/src/lib/ironrdp-decoder/`.

## When editing this crate

After any change to `src/lib.rs` or `Cargo.toml` (including IronRDP version bumps), regenerate the bindings before committing:

```sh
cd wasm/ironrdp-decoder
make build
```

The Makefile injects `--remap-path-prefix=$HOME=build` into `RUSTFLAGS` so the committed `.wasm` doesn't carry your home-directory path (and username). Running raw `wasm-pack build` skips that and leaks the path.

The bindings under `frontend/src/lib/ironrdp-decoder/` are committed so the frontend builds without a Rust toolchain. Skipping the rebuild leaves source and bindings out of sync and the frontend keeps running the old WASM.

See [README.md](./README.md) for prerequisites and full context.
