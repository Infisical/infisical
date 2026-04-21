/* @ts-self-types="./infisical_rdp_decoder.d.ts" */

export class DirtyRect {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(DirtyRect.prototype);
        obj.__wbg_ptr = ptr;
        DirtyRectFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        DirtyRectFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_dirtyrect_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get h() {
        const ret = wasm.__wbg_get_dirtyrect_h(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get w() {
        const ret = wasm.__wbg_get_dirtyrect_w(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get x() {
        const ret = wasm.__wbg_get_dirtyrect_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get y() {
        const ret = wasm.__wbg_get_dirtyrect_y(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set h(arg0) {
        wasm.__wbg_set_dirtyrect_h(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set w(arg0) {
        wasm.__wbg_set_dirtyrect_w(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set x(arg0) {
        wasm.__wbg_set_dirtyrect_x(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set y(arg0) {
        wasm.__wbg_set_dirtyrect_y(this.__wbg_ptr, arg0);
    }
}
if (Symbol.dispose) DirtyRect.prototype[Symbol.dispose] = DirtyRect.prototype.free;

/**
 * @enum {0 | 1}
 */
export const PduAction = Object.freeze({
    X224: 0, "0": "X224",
    FastPath: 1, "1": "FastPath",
});

/**
 * A decoder session tied to a specific desktop size. Create one per
 * replay, feed PDUs in original order, read out the framebuffer + dirty
 * regions after each call.
 */
export class RdpDecoder {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RdpDecoderFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_rdpdecoder_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    buffer_len() {
        const ret = wasm.rdpdecoder_buffer_len(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Returns a pointer into the WASM linear memory for the RGBA
     * framebuffer. JS reads this as a `Uint8Array` of length
     * `width * height * 4`.
     * @returns {number}
     */
    buffer_ptr() {
        const ret = wasm.rdpdecoder_buffer_ptr(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Returns the i-th dirty rect from the most recent `feed()` call.
     * @param {number} i
     * @returns {DirtyRect | undefined}
     */
    dirty_rect(i) {
        const ret = wasm.rdpdecoder_dirty_rect(this.__wbg_ptr, i);
        return ret === 0 ? undefined : DirtyRect.__wrap(ret);
    }
    /**
     * Feed one captured PDU into the decoder. Returns the number of
     * dirty rectangles produced; read each via `dirty_rect(i)`.
     *
     * `action` is 0 for X.224 and 1 for FastPath; mirrors the tap event
     * emitted by the gateway.
     * @param {number} action
     * @param {Uint8Array} bytes
     * @returns {number}
     */
    feed(action, bytes) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.rdpdecoder_feed(this.__wbg_ptr, action, ptr0, len0);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    height() {
        const ret = wasm.rdpdecoder_height(this.__wbg_ptr);
        return ret;
    }
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
     * @param {number} x
     * @param {number} y
     * @returns {number}
     */
    move_pointer(x, y) {
        const ret = wasm.rdpdecoder_move_pointer(this.__wbg_ptr, x, y);
        return ret >>> 0;
    }
    /**
     * Construct a decoder with a framebuffer of `width x height` pixels
     * in RGBA32 format.
     * @param {number} width
     * @param {number} height
     */
    constructor(width, height) {
        const ret = wasm.rdpdecoder_new(width, height);
        this.__wbg_ptr = ret >>> 0;
        RdpDecoderFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Returns the row stride in bytes. Usually `width * 4` but IronRDP
     * may align differently.
     * @returns {number}
     */
    stride() {
        const ret = wasm.rdpdecoder_stride(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    width() {
        const ret = wasm.rdpdecoder_width(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) RdpDecoder.prototype[Symbol.dispose] = RdpDecoder.prototype.free;

export function start() {
    wasm.start();
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_6b64449b9b9ed33c: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_log_0c201ade58bb55e1: function(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.log(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3), getStringFromWasm0(arg4, arg5), getStringFromWasm0(arg6, arg7));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_log_ce2c4456b290c5e7: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.log(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_mark_b4d943f3bc2d2404: function(arg0, arg1) {
            performance.mark(getStringFromWasm0(arg0, arg1));
        },
        __wbg_measure_84362959e621a2c1: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            let deferred0_0;
            let deferred0_1;
            let deferred1_0;
            let deferred1_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                deferred1_0 = arg2;
                deferred1_1 = arg3;
                performance.measure(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
                wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
            }
        }, arguments); },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./infisical_rdp_decoder_bg.js": import0,
    };
}

const DirtyRectFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_dirtyrect_free(ptr >>> 0, 1));
const RdpDecoderFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_rdpdecoder_free(ptr >>> 0, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasm;
function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    wasmModule = module;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('infisical_rdp_decoder_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
