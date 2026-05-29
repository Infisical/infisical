/* tslint:disable */
/* eslint-disable */

export class DirtyRect {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    h: number;
    w: number;
    x: number;
    y: number;
}

/**
 * A decoder session tied to a specific desktop size. Create one per
 * replay, feed PDUs in original order, read out the framebuffer + dirty
 * regions after each call.
 */
export class RdpDecoder {
    free(): void;
    [Symbol.dispose](): void;
    buffer_len(): number;
    /**
     * Returns a pointer into the WASM linear memory for the RGBA
     * framebuffer. JS reads this as a `Uint8Array` of length
     * `width * height * 4`.
     */
    buffer_ptr(): number;
    /**
     * Returns the i-th dirty rect from the most recent `feed()` call.
     */
    dirty_rect(i: number): DirtyRect | undefined;
    /**
     * Feed one captured PDU into the decoder. Returns the number of
     * dirty rectangles produced; read each via `dirty_rect(i)`.
     *
     * `action` is 0 for X.224 and 1 for FastPath; mirrors the tap event
     * emitted by the gateway.
     */
    feed(action: number, bytes: Uint8Array): number;
    height(): number;
    /**
     * Move the server-rendered pointer sprite to (x, y) and re-composite
     * it into the framebuffer. Returns the number of dirty rectangles
     * produced (read via `dirty_rect(i)`, same as `feed`).
     *
     * The server only emits PositionPointer PDUs for server-initiated
     * cursor moves (dialog focus pulls, etc). Client-driven mouse
     * movement is resolved locally — a live IronRDP client calls this
     * on every mousemove. For replay we drive it from recorded input
     * events so the cursor tracks the user's actual pointer path.
     */
    move_pointer(x: number, y: number): number;
    /**
     * Construct a decoder with a framebuffer of `width x height` pixels
     * in RGBA32 format.
     */
    constructor(width: number, height: number);
    /**
     * Returns the row stride in bytes. Usually `width * 4` but IronRDP
     * may align differently.
     */
    stride(): number;
    width(): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_dirtyrect_free: (a: number, b: number) => void;
    readonly __wbg_get_dirtyrect_h: (a: number) => number;
    readonly __wbg_get_dirtyrect_w: (a: number) => number;
    readonly __wbg_get_dirtyrect_x: (a: number) => number;
    readonly __wbg_get_dirtyrect_y: (a: number) => number;
    readonly __wbg_rdpdecoder_free: (a: number, b: number) => void;
    readonly __wbg_set_dirtyrect_h: (a: number, b: number) => void;
    readonly __wbg_set_dirtyrect_w: (a: number, b: number) => void;
    readonly __wbg_set_dirtyrect_x: (a: number, b: number) => void;
    readonly __wbg_set_dirtyrect_y: (a: number, b: number) => void;
    readonly rdpdecoder_buffer_len: (a: number) => number;
    readonly rdpdecoder_buffer_ptr: (a: number) => number;
    readonly rdpdecoder_dirty_rect: (a: number, b: number) => number;
    readonly rdpdecoder_feed: (a: number, b: number, c: number, d: number) => number;
    readonly rdpdecoder_height: (a: number) => number;
    readonly rdpdecoder_move_pointer: (a: number, b: number, c: number) => number;
    readonly rdpdecoder_new: (a: number, b: number) => number;
    readonly rdpdecoder_stride: (a: number) => number;
    readonly rdpdecoder_width: (a: number) => number;
    readonly __wbindgen_export: (a: number, b: number) => number;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
