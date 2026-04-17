import wasmUrl from './ironrdp_web_bg.wasm?url';

/* @ts-self-types="./ironrdp_web.d.ts" */

export class ClipboardData {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(ClipboardData.prototype);
        obj.__wbg_ptr = ptr;
        ClipboardDataFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ClipboardDataFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_clipboarddata_free(ptr, 0);
    }
    /**
     * @param {string} mime_type
     * @param {Uint8Array} binary
     */
    addBinary(mime_type, binary) {
        const ptr0 = passStringToWasm0(mime_type, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(binary, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        wasm.clipboarddata_addBinary(this.__wbg_ptr, ptr0, len0, ptr1, len1);
    }
    /**
     * @param {string} mime_type
     * @param {string} text
     */
    addText(mime_type, text) {
        const ptr0 = passStringToWasm0(mime_type, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        wasm.clipboarddata_addText(this.__wbg_ptr, ptr0, len0, ptr1, len1);
    }
    constructor() {
        const ret = wasm.clipboarddata_create();
        this.__wbg_ptr = ret >>> 0;
        ClipboardDataFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {boolean}
     */
    isEmpty() {
        const ret = wasm.clipboarddata_isEmpty(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {ClipboardItem[]}
     */
    items() {
        const ret = wasm.clipboarddata_items(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
}
if (Symbol.dispose) ClipboardData.prototype[Symbol.dispose] = ClipboardData.prototype.free;

export class ClipboardItem {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(ClipboardItem.prototype);
        obj.__wbg_ptr = ptr;
        ClipboardItemFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ClipboardItemFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_clipboarditem_free(ptr, 0);
    }
    /**
     * @returns {string}
     */
    mimeType() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.clipboarditem_mimeType(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {any}
     */
    value() {
        const ret = wasm.clipboarditem_value(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) ClipboardItem.prototype[Symbol.dispose] = ClipboardItem.prototype.free;

export class DesktopSize {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(DesktopSize.prototype);
        obj.__wbg_ptr = ptr;
        DesktopSizeFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        DesktopSizeFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_desktopsize_free(ptr, 0);
    }
    /**
     * @param {number} width
     * @param {number} height
     */
    constructor(width, height) {
        const ret = wasm.desktopsize_create(width, height);
        this.__wbg_ptr = ret >>> 0;
        DesktopSizeFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {number}
     */
    get height() {
        const ret = wasm.__wbg_get_desktopsize_height(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get width() {
        const ret = wasm.__wbg_get_desktopsize_width(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set height(arg0) {
        wasm.__wbg_set_desktopsize_height(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set width(arg0) {
        wasm.__wbg_set_desktopsize_width(this.__wbg_ptr, arg0);
    }
}
if (Symbol.dispose) DesktopSize.prototype[Symbol.dispose] = DesktopSize.prototype.free;

export class DeviceEvent {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(DeviceEvent.prototype);
        obj.__wbg_ptr = ptr;
        DeviceEventFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        DeviceEventFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_deviceevent_free(ptr, 0);
    }
    /**
     * @param {number} scancode
     * @returns {DeviceEvent}
     */
    static keyPressed(scancode) {
        const ret = wasm.deviceevent_keyPressed(scancode);
        return DeviceEvent.__wrap(ret);
    }
    /**
     * @param {number} scancode
     * @returns {DeviceEvent}
     */
    static keyReleased(scancode) {
        const ret = wasm.deviceevent_keyReleased(scancode);
        return DeviceEvent.__wrap(ret);
    }
    /**
     * @param {number} button
     * @returns {DeviceEvent}
     */
    static mouseButtonPressed(button) {
        const ret = wasm.deviceevent_mouseButtonPressed(button);
        return DeviceEvent.__wrap(ret);
    }
    /**
     * @param {number} button
     * @returns {DeviceEvent}
     */
    static mouseButtonReleased(button) {
        const ret = wasm.deviceevent_mouseButtonReleased(button);
        return DeviceEvent.__wrap(ret);
    }
    /**
     * @param {number} x
     * @param {number} y
     * @returns {DeviceEvent}
     */
    static mouseMove(x, y) {
        const ret = wasm.deviceevent_mouseMove(x, y);
        return DeviceEvent.__wrap(ret);
    }
    /**
     * @param {string} unicode
     * @returns {DeviceEvent}
     */
    static unicodePressed(unicode) {
        const char0 = unicode.codePointAt(0);
        _assertChar(char0);
        const ret = wasm.deviceevent_unicodePressed(char0);
        return DeviceEvent.__wrap(ret);
    }
    /**
     * @param {string} unicode
     * @returns {DeviceEvent}
     */
    static unicodeReleased(unicode) {
        const char0 = unicode.codePointAt(0);
        _assertChar(char0);
        const ret = wasm.deviceevent_unicodeReleased(char0);
        return DeviceEvent.__wrap(ret);
    }
    /**
     * @param {boolean} vertical
     * @param {number} rotation_amount
     * @param {RotationUnit} rotation_unit
     * @returns {DeviceEvent}
     */
    static wheelRotations(vertical, rotation_amount, rotation_unit) {
        const ret = wasm.deviceevent_wheelRotations(vertical, rotation_amount, rotation_unit);
        return DeviceEvent.__wrap(ret);
    }
}
if (Symbol.dispose) DeviceEvent.prototype[Symbol.dispose] = DeviceEvent.prototype.free;

export class Extension {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ExtensionFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_extension_free(ptr, 0);
    }
    /**
     * @param {string} ident
     * @param {any} value
     */
    constructor(ident, value) {
        const ptr0 = passStringToWasm0(ident, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.extension_create(ptr0, len0, value);
        this.__wbg_ptr = ret >>> 0;
        ExtensionFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}
if (Symbol.dispose) Extension.prototype[Symbol.dispose] = Extension.prototype.free;

export class InputTransaction {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        InputTransactionFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_inputtransaction_free(ptr, 0);
    }
    /**
     * @param {DeviceEvent} event
     */
    addEvent(event) {
        _assertClass(event, DeviceEvent);
        var ptr0 = event.__destroy_into_raw();
        wasm.inputtransaction_addEvent(this.__wbg_ptr, ptr0);
    }
    constructor() {
        const ret = wasm.inputtransaction_create();
        this.__wbg_ptr = ret >>> 0;
        InputTransactionFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}
if (Symbol.dispose) InputTransaction.prototype[Symbol.dispose] = InputTransaction.prototype.free;

export class IronError {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(IronError.prototype);
        obj.__wbg_ptr = ptr;
        IronErrorFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        IronErrorFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_ironerror_free(ptr, 0);
    }
    /**
     * @returns {string}
     */
    backtrace() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.ironerror_backtrace(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {IronErrorKind}
     */
    kind() {
        const ret = wasm.ironerror_kind(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {RDCleanPathDetails | undefined}
     */
    rdcleanpathDetails() {
        const ret = wasm.ironerror_rdcleanpathDetails(this.__wbg_ptr);
        return ret === 0 ? undefined : RDCleanPathDetails.__wrap(ret);
    }
}
if (Symbol.dispose) IronError.prototype[Symbol.dispose] = IronError.prototype.free;

/**
 * @enum {0 | 1 | 2 | 3 | 4 | 5 | 6}
 */
export const IronErrorKind = Object.freeze({
    /**
     * Catch-all error kind
     */
    General: 0, "0": "General",
    /**
     * Incorrect password used
     */
    WrongPassword: 1, "1": "WrongPassword",
    /**
     * Unable to login to machine
     */
    LogonFailure: 2, "2": "LogonFailure",
    /**
     * Insufficient permission, server denied access
     */
    AccessDenied: 3, "3": "AccessDenied",
    /**
     * Something wrong happened when sending or receiving the RDCleanPath message
     */
    RDCleanPath: 4, "4": "RDCleanPath",
    /**
     * Couldn't connect to proxy
     */
    ProxyConnect: 5, "5": "ProxyConnect",
    /**
     * Protocol negotiation failed
     */
    NegotiationFailure: 6, "6": "NegotiationFailure",
});

/**
 * Detailed error information for RDCleanPath errors.
 *
 * When an RDCleanPath error occurs, this structure provides granular details
 * about the underlying cause, including HTTP status codes, Windows Socket errors,
 * and TLS alert codes.
 */
export class RDCleanPathDetails {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(RDCleanPathDetails.prototype);
        obj.__wbg_ptr = ptr;
        RDCleanPathDetailsFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RDCleanPathDetailsFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_rdcleanpathdetails_free(ptr, 0);
    }
    /**
     * HTTP status code if the error originated from an HTTP response.
     *
     * Common values:
     * - 403: Forbidden (e.g., deleted VNET, insufficient permissions)
     * - 404: Not Found
     * - 500: Internal Server Error
     * - 502: Bad Gateway
     * - 503: Service Unavailable
     * @returns {number | undefined}
     */
    get httpStatusCode() {
        const ret = wasm.rdcleanpathdetails_httpStatusCode(this.__wbg_ptr);
        return ret === 0xFFFFFF ? undefined : ret;
    }
    /**
     * TLS alert code if the error occurred during TLS handshake.
     *
     * Common values:
     * - 40: Handshake failure
     * - 42: Bad certificate
     * - 45: Certificate expired
     * - 48: Unknown CA
     * - 112: Unrecognized name
     * @returns {number | undefined}
     */
    get tlsAlertCode() {
        const ret = wasm.rdcleanpathdetails_tlsAlertCode(this.__wbg_ptr);
        return ret === 0xFFFFFF ? undefined : ret;
    }
    /**
     * Windows Socket API (WSA) error code.
     *
     * Common values:
     * - 10013: Permission denied (WSAEACCES) - often indicates deleted/invalid VNET
     * - 10060: Connection timed out (WSAETIMEDOUT)
     * - 10061: Connection refused (WSAECONNREFUSED)
     * - 10051: Network is unreachable (WSAENETUNREACH)
     * - 10065: No route to host (WSAEHOSTUNREACH)
     * @returns {number | undefined}
     */
    get wsaErrorCode() {
        const ret = wasm.rdcleanpathdetails_wsaErrorCode(this.__wbg_ptr);
        return ret === 0xFFFFFF ? undefined : ret;
    }
}
if (Symbol.dispose) RDCleanPathDetails.prototype[Symbol.dispose] = RDCleanPathDetails.prototype.free;

export class RdpFile {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RdpFileFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_rdpfile_free(ptr, 0);
    }
    constructor() {
        const ret = wasm.rdpfile_create();
        this.__wbg_ptr = ret >>> 0;
        RdpFileFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {string} key
     * @returns {number | undefined}
     */
    getInt(key) {
        const ptr0 = passStringToWasm0(key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.rdpfile_getInt(this.__wbg_ptr, ptr0, len0);
        return ret === 0x100000001 ? undefined : ret;
    }
    /**
     * @param {string} key
     * @returns {string | undefined}
     */
    getStr(key) {
        const ptr0 = passStringToWasm0(key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.rdpfile_getStr(this.__wbg_ptr, ptr0, len0);
        let v2;
        if (ret[0] !== 0) {
            v2 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v2;
    }
    /**
     * @param {string} key
     * @param {number} value
     */
    insertInt(key, value) {
        const ptr0 = passStringToWasm0(key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.rdpfile_insertInt(this.__wbg_ptr, ptr0, len0, value);
    }
    /**
     * @param {string} key
     * @param {string} value
     */
    insertStr(key, value) {
        const ptr0 = passStringToWasm0(key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(value, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        wasm.rdpfile_insertStr(this.__wbg_ptr, ptr0, len0, ptr1, len1);
    }
    /**
     * @param {string} config
     */
    parse(config) {
        const ptr0 = passStringToWasm0(config, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.rdpfile_parse(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
    write() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.rdpfile_write(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) RdpFile.prototype[Symbol.dispose] = RdpFile.prototype.free;

/**
 * @enum {0 | 1 | 2}
 */
export const RotationUnit = Object.freeze({
    Pixel: 0, "0": "Pixel",
    Line: 1, "1": "Line",
    Page: 2, "2": "Page",
});

export class Session {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(Session.prototype);
        obj.__wbg_ptr = ptr;
        SessionFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SessionFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_session_free(ptr, 0);
    }
    /**
     * @param {InputTransaction} transaction
     */
    applyInputs(transaction) {
        _assertClass(transaction, InputTransaction);
        var ptr0 = transaction.__destroy_into_raw();
        const ret = wasm.session_applyInputs(this.__wbg_ptr, ptr0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @returns {DesktopSize}
     */
    desktopSize() {
        const ret = wasm.session_desktopSize(this.__wbg_ptr);
        return DesktopSize.__wrap(ret);
    }
    /**
     * @param {Extension} ext
     * @returns {any}
     */
    invokeExtension(ext) {
        _assertClass(ext, Extension);
        var ptr0 = ext.__destroy_into_raw();
        const ret = wasm.session_invokeExtension(this.__wbg_ptr, ptr0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {ClipboardData} content
     * @returns {Promise<void>}
     */
    onClipboardPaste(content) {
        _assertClass(content, ClipboardData);
        const ret = wasm.session_onClipboardPaste(this.__wbg_ptr, content.__wbg_ptr);
        return ret;
    }
    releaseAllInputs() {
        const ret = wasm.session_releaseAllInputs(this.__wbg_ptr);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} width
     * @param {number} height
     * @param {number | null} [scale_factor]
     * @param {number | null} [physical_width]
     * @param {number | null} [physical_height]
     */
    resize(width, height, scale_factor, physical_width, physical_height) {
        wasm.session_resize(this.__wbg_ptr, width, height, isLikeNone(scale_factor) ? 0x100000001 : (scale_factor) >>> 0, isLikeNone(physical_width) ? 0x100000001 : (physical_width) >>> 0, isLikeNone(physical_height) ? 0x100000001 : (physical_height) >>> 0);
    }
    /**
     * @returns {Promise<SessionTerminationInfo>}
     */
    run() {
        const ret = wasm.session_run(this.__wbg_ptr);
        return ret;
    }
    shutdown() {
        const ret = wasm.session_shutdown(this.__wbg_ptr);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @returns {boolean}
     */
    supportsUnicodeKeyboardShortcuts() {
        const ret = wasm.session_supportsUnicodeKeyboardShortcuts(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {boolean} scroll_lock
     * @param {boolean} num_lock
     * @param {boolean} caps_lock
     * @param {boolean} kana_lock
     */
    synchronizeLockKeys(scroll_lock, num_lock, caps_lock, kana_lock) {
        const ret = wasm.session_synchronizeLockKeys(this.__wbg_ptr, scroll_lock, num_lock, caps_lock, kana_lock);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
}
if (Symbol.dispose) Session.prototype[Symbol.dispose] = Session.prototype.free;

export class SessionBuilder {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(SessionBuilder.prototype);
        obj.__wbg_ptr = ptr;
        SessionBuilderFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SessionBuilderFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_sessionbuilder_free(ptr, 0);
    }
    /**
     * @param {string} token
     * @returns {SessionBuilder}
     */
    authToken(token) {
        const ptr0 = passStringToWasm0(token, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.sessionbuilder_authToken(this.__wbg_ptr, ptr0, len0);
        return SessionBuilder.__wrap(ret);
    }
    /**
     * @param {Function} callback
     * @returns {SessionBuilder}
     */
    canvasResizedCallback(callback) {
        const ret = wasm.sessionbuilder_canvasResizedCallback(this.__wbg_ptr, callback);
        return SessionBuilder.__wrap(ret);
    }
    /**
     * @returns {Promise<Session>}
     */
    connect() {
        const ret = wasm.sessionbuilder_connect(this.__wbg_ptr);
        return ret;
    }
    constructor() {
        const ret = wasm.sessionbuilder_create();
        this.__wbg_ptr = ret >>> 0;
        SessionBuilderFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {DesktopSize} desktop_size
     * @returns {SessionBuilder}
     */
    desktopSize(desktop_size) {
        _assertClass(desktop_size, DesktopSize);
        var ptr0 = desktop_size.__destroy_into_raw();
        const ret = wasm.sessionbuilder_desktopSize(this.__wbg_ptr, ptr0);
        return SessionBuilder.__wrap(ret);
    }
    /**
     * @param {string} destination
     * @returns {SessionBuilder}
     */
    destination(destination) {
        const ptr0 = passStringToWasm0(destination, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.sessionbuilder_destination(this.__wbg_ptr, ptr0, len0);
        return SessionBuilder.__wrap(ret);
    }
    /**
     * @param {Extension} ext
     * @returns {SessionBuilder}
     */
    extension(ext) {
        _assertClass(ext, Extension);
        var ptr0 = ext.__destroy_into_raw();
        const ret = wasm.sessionbuilder_extension(this.__wbg_ptr, ptr0);
        return SessionBuilder.__wrap(ret);
    }
    /**
     * @param {Function} callback
     * @returns {SessionBuilder}
     */
    forceClipboardUpdateCallback(callback) {
        const ret = wasm.sessionbuilder_forceClipboardUpdateCallback(this.__wbg_ptr, callback);
        return SessionBuilder.__wrap(ret);
    }
    /**
     * @param {string} password
     * @returns {SessionBuilder}
     */
    password(password) {
        const ptr0 = passStringToWasm0(password, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.sessionbuilder_password(this.__wbg_ptr, ptr0, len0);
        return SessionBuilder.__wrap(ret);
    }
    /**
     * @param {string} address
     * @returns {SessionBuilder}
     */
    proxyAddress(address) {
        const ptr0 = passStringToWasm0(address, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.sessionbuilder_proxyAddress(this.__wbg_ptr, ptr0, len0);
        return SessionBuilder.__wrap(ret);
    }
    /**
     * @param {Function} callback
     * @returns {SessionBuilder}
     */
    remoteClipboardChangedCallback(callback) {
        const ret = wasm.sessionbuilder_remoteClipboardChangedCallback(this.__wbg_ptr, callback);
        return SessionBuilder.__wrap(ret);
    }
    /**
     * @param {HTMLCanvasElement} canvas
     * @returns {SessionBuilder}
     */
    renderCanvas(canvas) {
        const ret = wasm.sessionbuilder_renderCanvas(this.__wbg_ptr, canvas);
        return SessionBuilder.__wrap(ret);
    }
    /**
     * @param {string} server_domain
     * @returns {SessionBuilder}
     */
    serverDomain(server_domain) {
        const ptr0 = passStringToWasm0(server_domain, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.sessionbuilder_serverDomain(this.__wbg_ptr, ptr0, len0);
        return SessionBuilder.__wrap(ret);
    }
    /**
     * @param {Function} callback
     * @returns {SessionBuilder}
     */
    setCursorStyleCallback(callback) {
        const ret = wasm.sessionbuilder_setCursorStyleCallback(this.__wbg_ptr, callback);
        return SessionBuilder.__wrap(ret);
    }
    /**
     * @param {any} context
     * @returns {SessionBuilder}
     */
    setCursorStyleCallbackContext(context) {
        const ret = wasm.sessionbuilder_setCursorStyleCallbackContext(this.__wbg_ptr, context);
        return SessionBuilder.__wrap(ret);
    }
    /**
     * @param {string} username
     * @returns {SessionBuilder}
     */
    username(username) {
        const ptr0 = passStringToWasm0(username, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.sessionbuilder_username(this.__wbg_ptr, ptr0, len0);
        return SessionBuilder.__wrap(ret);
    }
}
if (Symbol.dispose) SessionBuilder.prototype[Symbol.dispose] = SessionBuilder.prototype.free;

export class SessionTerminationInfo {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(SessionTerminationInfo.prototype);
        obj.__wbg_ptr = ptr;
        SessionTerminationInfoFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SessionTerminationInfoFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_sessionterminationinfo_free(ptr, 0);
    }
    /**
     * @returns {string}
     */
    reason() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.sessionterminationinfo_reason(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) SessionTerminationInfo.prototype[Symbol.dispose] = SessionTerminationInfo.prototype.free;

/**
 * @param {string} log_level
 */
export function setup(log_level) {
    const ptr0 = passStringToWasm0(log_level, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.setup(ptr0, len0);
}

function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_boolean_get_fe2a24fdfdb4064f: function(arg0) {
            const v = arg0;
            const ret = typeof(v) === 'boolean' ? v : undefined;
            return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
        },
        __wbg___wbindgen_debug_string_d89627202d0155b7: function(arg0, arg1) {
            const ret = debugString(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_is_function_2a95406423ea8626: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_null_8d90524c9e0af183: function(arg0) {
            const ret = arg0 === null;
            return ret;
        },
        __wbg___wbindgen_is_string_624d5244bb2bc87c: function(arg0) {
            const ret = typeof(arg0) === 'string';
            return ret;
        },
        __wbg___wbindgen_is_undefined_87a3a837f331fef5: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_number_get_769f3676dc20c1d7: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'number' ? obj : undefined;
            getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_string_get_f1161390414f9b59: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_5549492daedad139: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg__wbg_cb_unref_fbe69bb076c16bad: function(arg0) {
            arg0._wbg_cb_unref();
        },
        __wbg_addEventListener_22cc39177d983010: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            arg0.addEventListener(getStringFromWasm0(arg1, arg2), arg3, arg4);
        }, arguments); },
        __wbg_addEventListener_ee34fcb181ae85b2: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            arg0.addEventListener(getStringFromWasm0(arg1, arg2), arg3);
        }, arguments); },
        __wbg_apply_71cf8013f96ab8ff: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.apply(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_arrayBuffer_9f258d017f7107c5: function() { return handleError(function (arg0) {
            const ret = arg0.arrayBuffer();
            return ret;
        }, arguments); },
        __wbg_call_4f2f92601568b772: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = arg0.call(arg1, arg2, arg3);
            return ret;
        }, arguments); },
        __wbg_call_6ae20895a60069a2: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.call(arg1);
            return ret;
        }, arguments); },
        __wbg_call_8f5d7bb070283508: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_clearInterval_26ba580547547579: function(arg0) {
            const ret = clearInterval(arg0);
            return ret;
        },
        __wbg_clearTimeout_3629d6209dfcc46e: function(arg0) {
            const ret = clearTimeout(arg0);
            return ret;
        },
        __wbg_clipboarddata_new: function(arg0) {
            const ret = ClipboardData.__wrap(arg0);
            return ret;
        },
        __wbg_clipboarditem_new: function(arg0) {
            const ret = ClipboardItem.__wrap(arg0);
            return ret;
        },
        __wbg_close_1bf0654059764e94: function() { return handleError(function (arg0) {
            arg0.close();
        }, arguments); },
        __wbg_code_7eb5b8af0cea9f25: function(arg0) {
            const ret = arg0.code;
            return ret;
        },
        __wbg_data_7de671a92a650aba: function(arg0) {
            const ret = arg0.data;
            return ret;
        },
        __wbg_debug_f0141abe14621fb0: function(arg0) {
            console.debug(arg0);
        },
        __wbg_dispatchEvent_87c87cb727d84e9b: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.dispatchEvent(arg1);
            return ret;
        }, arguments); },
        __wbg_error_a6fa202b58aa1cd3: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.error(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_error_de6b86e598505246: function(arg0) {
            console.error(arg0);
        },
        __wbg_fetch_9b478faef8cda538: function(arg0) {
            const ret = fetch(arg0);
            return ret;
        },
        __wbg_from_45cebbf5e49a6ac6: function(arg0) {
            const ret = Array.from(arg0);
            return ret;
        },
        __wbg_getContext_749c4678f6cac6fb: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.getContext(getStringFromWasm0(arg1, arg2));
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        }, arguments); },
        __wbg_getRandomValues_3f44b700395062e5: function() { return handleError(function (arg0, arg1) {
            globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
        }, arguments); },
        __wbg_getRandomValues_ce910aa6e33a532a: function() { return handleError(function (arg0, arg1) {
            globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
        }, arguments); },
        __wbg_getRandomValues_ef8a9e8b447216e2: function() { return handleError(function (arg0, arg1) {
            globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
        }, arguments); },
        __wbg_getTime_c3af35594e283356: function(arg0) {
            const ret = arg0.getTime();
            return ret;
        },
        __wbg_get_94f5fc088edd3138: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_get_ff5f1fb220233477: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_info_ca2d5ad6378d3000: function(arg0) {
            console.info(arg0);
        },
        __wbg_instanceof_ArrayBuffer_8d855993947fc3a2: function(arg0) {
            let result;
            try {
                result = arg0 instanceof ArrayBuffer;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_CanvasRenderingContext2d_05c92edaf1c9546d: function(arg0) {
            let result;
            try {
                result = arg0 instanceof CanvasRenderingContext2D;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Error_e14ad3dc04e9f18c: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Error;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Object_d622a5764f4f9002: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Object;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Response_fece7eabbcaca4c3: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Response;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Window_2fa8d9c2d5b6104a: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Window;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_ironerror_new: function(arg0) {
            const ret = IronError.__wrap(arg0);
            return ret;
        },
        __wbg_length_e6e1633fbea6cfa9: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_fae3e439140f48a4: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_message_613f79663a57a145: function(arg0) {
            const ret = arg0.message;
            return ret;
        },
        __wbg_name_3aa8b7545ecd9f40: function(arg0) {
            const ret = arg0.name;
            return ret;
        },
        __wbg_new_0_e649c99e7382313f: function() {
            const ret = new Date();
            return ret;
        },
        __wbg_new_1d96678aaacca32e: function(arg0) {
            const ret = new Uint8Array(arg0);
            return ret;
        },
        __wbg_new_210ef5849ab6cf48: function() { return handleError(function () {
            const ret = new Headers();
            return ret;
        }, arguments); },
        __wbg_new_227d7c05414eb861: function() {
            const ret = new Error();
            return ret;
        },
        __wbg_new_3fcda0d9117b718b: function() { return handleError(function () {
            const ret = new URLSearchParams();
            return ret;
        }, arguments); },
        __wbg_new_4370be21fa2b2f80: function() {
            const ret = new Array();
            return ret;
        },
        __wbg_new_48e1d86cfd30c8e7: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_69642b0f6c3151cc: function() { return handleError(function (arg0, arg1) {
            const ret = new WebSocket(getStringFromWasm0(arg0, arg1));
            return ret;
        }, arguments); },
        __wbg_new_b906fdbc60e83470: function() { return handleError(function (arg0, arg1) {
            const ret = new URL(getStringFromWasm0(arg0, arg1));
            return ret;
        }, arguments); },
        __wbg_new_from_slice_0bc58e36f82a1b50: function(arg0, arg1) {
            const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_from_slice_59697c71957dca49: function(arg0, arg1) {
            const ret = new Uint32Array(getArrayU32FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_typed_25dda2388d7e5e9f: function(arg0, arg1) {
            try {
                var state0 = {a: arg0, b: arg1};
                var cb0 = (arg0, arg1) => {
                    const a = state0.a;
                    state0.a = 0;
                    try {
                        return wasm_bindgen__convert__closures_____invoke__h1f53b3858a424e34(a, state0.b, arg0, arg1);
                    } finally {
                        state0.a = a;
                    }
                };
                const ret = new Promise(cb0);
                return ret;
            } finally {
                state0.a = 0;
            }
        },
        __wbg_new_with_event_init_dict_40d4a5390749bc2b: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = new CloseEvent(getStringFromWasm0(arg0, arg1), arg2);
            return ret;
        }, arguments); },
        __wbg_new_with_str_6f03957bf9e0f079: function() { return handleError(function (arg0, arg1) {
            const ret = new Request(getStringFromWasm0(arg0, arg1));
            return ret;
        }, arguments); },
        __wbg_new_with_str_and_init_cb3df438bf62964e: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = new Request(getStringFromWasm0(arg0, arg1), arg2);
            return ret;
        }, arguments); },
        __wbg_new_with_u8_array_sequence_94f841de058973f0: function() { return handleError(function (arg0) {
            const ret = new Blob(arg0);
            return ret;
        }, arguments); },
        __wbg_new_with_u8_clamped_array_cca0f3f87f74eed0: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = new ImageData(getClampedArrayU8FromWasm0(arg0, arg1), arg2 >>> 0);
            return ret;
        }, arguments); },
        __wbg_now_46736a527d2e74e7: function() {
            const ret = Date.now();
            return ret;
        },
        __wbg_now_a9af4554edb7ac78: function(arg0) {
            const ret = arg0.now();
            return ret;
        },
        __wbg_of_a96e15740cdace88: function(arg0) {
            const ret = Array.of(arg0);
            return ret;
        },
        __wbg_ok_5865d0a94e185135: function(arg0) {
            const ret = arg0.ok;
            return ret;
        },
        __wbg_performance_bfcc5d2782556997: function(arg0) {
            const ret = arg0.performance;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_prototypesetcall_3875d54d12ef2eec: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_push_d0006a37f9fcda6d: function(arg0, arg1) {
            const ret = arg0.push(arg1);
            return ret;
        },
        __wbg_putImageData_2c641779141d9fa5: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7) {
            arg0.putImageData(arg1, arg2, arg3, arg4, arg5, arg6, arg7);
        }, arguments); },
        __wbg_putImageData_4f516b1f09a578ad: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7) {
            arg0.putImageData(arg1, arg2, arg3, arg4, arg5, arg6, arg7);
        }, arguments); },
        __wbg_queueMicrotask_8868365114fe23b5: function(arg0) {
            queueMicrotask(arg0);
        },
        __wbg_queueMicrotask_cfc5a0e62f9ebdbe: function(arg0) {
            const ret = arg0.queueMicrotask;
            return ret;
        },
        __wbg_readyState_a08d25cc57214030: function(arg0) {
            const ret = arg0.readyState;
            return ret;
        },
        __wbg_reason_30c85ca866e286f0: function(arg0, arg1) {
            const ret = arg1.reason;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_removeEventListener_7c855f86999b3efc: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            arg0.removeEventListener(getStringFromWasm0(arg1, arg2), arg3);
        }, arguments); },
        __wbg_resolve_d8059bc113e215bf: function(arg0) {
            const ret = Promise.resolve(arg0);
            return ret;
        },
        __wbg_search_a8db99ec94d5c914: function(arg0, arg1) {
            const ret = arg1.search;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_send_73e9cb70b2a23e05: function() { return handleError(function (arg0, arg1, arg2) {
            arg0.send(getStringFromWasm0(arg1, arg2));
        }, arguments); },
        __wbg_send_d894fd22f80a529f: function() { return handleError(function (arg0, arg1) {
            arg0.send(arg1);
        }, arguments); },
        __wbg_session_new: function(arg0) {
            const ret = Session.__wrap(arg0);
            return ret;
        },
        __wbg_sessionterminationinfo_new: function(arg0) {
            const ret = SessionTerminationInfo.__wrap(arg0);
            return ret;
        },
        __wbg_setInterval_cbf1c35c6a692d37: function() { return handleError(function (arg0, arg1) {
            const ret = setInterval(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_setTimeout_56bcdccbad22fd44: function() { return handleError(function (arg0, arg1) {
            const ret = setTimeout(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_set_0b4302959e9491f2: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            arg0.set(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
        }, arguments); },
        __wbg_set_991082a7a49971cf: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = Reflect.set(arg0, arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_set_binaryType_0675f0e51c055ca8: function(arg0, arg1) {
            arg0.binaryType = __wbindgen_enum_BinaryType[arg1];
        },
        __wbg_set_body_e2cf9537a2f3e0be: function(arg0, arg1) {
            arg0.body = arg1;
        },
        __wbg_set_code_10bd076f01822d8d: function(arg0, arg1) {
            arg0.code = arg1;
        },
        __wbg_set_headers_22d4b01224273a83: function(arg0, arg1) {
            arg0.headers = arg1;
        },
        __wbg_set_height_281ab7665c19410b: function(arg0, arg1) {
            arg0.height = arg1 >>> 0;
        },
        __wbg_set_height_ca5cf61f84950ca0: function(arg0, arg1) {
            arg0.height = arg1 >>> 0;
        },
        __wbg_set_method_4a4ab3faba8a018c: function(arg0, arg1, arg2) {
            arg0.method = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_once_3f8e98ae18cf7525: function(arg0, arg1) {
            arg0.once = arg1 !== 0;
        },
        __wbg_set_reason_60909f2496e84862: function(arg0, arg1, arg2) {
            arg0.reason = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_search_f793f9b7d0fd753c: function(arg0, arg1, arg2) {
            arg0.search = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_width_2b175fb691e65ee4: function(arg0, arg1) {
            arg0.width = arg1 >>> 0;
        },
        __wbg_set_width_9cd58843b3b24ef9: function(arg0, arg1) {
            arg0.width = arg1 >>> 0;
        },
        __wbg_stack_3b0d974bbf31e44f: function(arg0, arg1) {
            const ret = arg1.stack;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_static_accessor_GLOBAL_8dfb7f5e26ebe523: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_THIS_941154efc8395cdd: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_58dac9af822f561f: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_ee64f0b3d8354c0b: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_statusText_d47258d1f4a842f0: function(arg0, arg1) {
            const ret = arg1.statusText;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_status_1ae443dc56281de7: function(arg0) {
            const ret = arg0.status;
            return ret;
        },
        __wbg_then_0150352e4ad20344: function(arg0, arg1, arg2) {
            const ret = arg0.then(arg1, arg2);
            return ret;
        },
        __wbg_then_5160486c67ddb98a: function(arg0, arg1) {
            const ret = arg0.then(arg1);
            return ret;
        },
        __wbg_toString_553b5f6e95e3e41b: function(arg0) {
            const ret = arg0.toString();
            return ret;
        },
        __wbg_toString_9e7353a77cb415a2: function(arg0) {
            const ret = arg0.toString();
            return ret;
        },
        __wbg_url_bc7dc04139db6f29: function(arg0, arg1) {
            const ret = arg1.url;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_warn_86ef03db8cfb4dd4: function(arg0) {
            console.warn(arg0);
        },
        __wbg_wasClean_2f24be63b9a84dc0: function(arg0) {
            const ret = arg0.wasClean;
            return ret;
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 3596, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen__convert__closures_____invoke__hd61d4058787ccc8f);
            return ret;
        },
        __wbindgen_cast_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("CloseEvent")], shim_idx: 1045, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen__convert__closures_____invoke__h1f6180b1ad3f7dd7);
            return ret;
        },
        __wbindgen_cast_0000000000000003: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("Event")], shim_idx: 1045, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen__convert__closures_____invoke__h1f6180b1ad3f7dd7_2);
            return ret;
        },
        __wbindgen_cast_0000000000000004: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("MessageEvent")], shim_idx: 1045, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen__convert__closures_____invoke__h1f6180b1ad3f7dd7_3);
            return ret;
        },
        __wbindgen_cast_0000000000000005: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [], shim_idx: 1037, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen__convert__closures_____invoke__he298c70639c77e8b);
            return ret;
        },
        __wbindgen_cast_0000000000000006: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [], shim_idx: 1048, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen__convert__closures_____invoke__h6521812627082f50);
            return ret;
        },
        __wbindgen_cast_0000000000000007: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_cast_0000000000000008: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
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
        "./ironrdp_web_bg.js": import0,
    };
}

function wasm_bindgen__convert__closures_____invoke__he298c70639c77e8b(arg0, arg1) {
    wasm.wasm_bindgen__convert__closures_____invoke__he298c70639c77e8b(arg0, arg1);
}

function wasm_bindgen__convert__closures_____invoke__h6521812627082f50(arg0, arg1) {
    wasm.wasm_bindgen__convert__closures_____invoke__h6521812627082f50(arg0, arg1);
}

function wasm_bindgen__convert__closures_____invoke__h1f6180b1ad3f7dd7(arg0, arg1, arg2) {
    wasm.wasm_bindgen__convert__closures_____invoke__h1f6180b1ad3f7dd7(arg0, arg1, arg2);
}

function wasm_bindgen__convert__closures_____invoke__h1f6180b1ad3f7dd7_2(arg0, arg1, arg2) {
    wasm.wasm_bindgen__convert__closures_____invoke__h1f6180b1ad3f7dd7_2(arg0, arg1, arg2);
}

function wasm_bindgen__convert__closures_____invoke__h1f6180b1ad3f7dd7_3(arg0, arg1, arg2) {
    wasm.wasm_bindgen__convert__closures_____invoke__h1f6180b1ad3f7dd7_3(arg0, arg1, arg2);
}

function wasm_bindgen__convert__closures_____invoke__hd61d4058787ccc8f(arg0, arg1, arg2) {
    const ret = wasm.wasm_bindgen__convert__closures_____invoke__hd61d4058787ccc8f(arg0, arg1, arg2);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

function wasm_bindgen__convert__closures_____invoke__h1f53b3858a424e34(arg0, arg1, arg2, arg3) {
    wasm.wasm_bindgen__convert__closures_____invoke__h1f53b3858a424e34(arg0, arg1, arg2, arg3);
}


const __wbindgen_enum_BinaryType = ["blob", "arraybuffer"];
const ClipboardDataFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_clipboarddata_free(ptr >>> 0, 1));
const ClipboardItemFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_clipboarditem_free(ptr >>> 0, 1));
const DesktopSizeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_desktopsize_free(ptr >>> 0, 1));
const DeviceEventFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_deviceevent_free(ptr >>> 0, 1));
const ExtensionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_extension_free(ptr >>> 0, 1));
const InputTransactionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_inputtransaction_free(ptr >>> 0, 1));
const IronErrorFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_ironerror_free(ptr >>> 0, 1));
const RDCleanPathDetailsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_rdcleanpathdetails_free(ptr >>> 0, 1));
const RdpFileFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_rdpfile_free(ptr >>> 0, 1));
const SessionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_session_free(ptr >>> 0, 1));
const SessionBuilderFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_sessionbuilder_free(ptr >>> 0, 1));
const SessionTerminationInfoFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_sessionterminationinfo_free(ptr >>> 0, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function _assertChar(c) {
    if (typeof(c) === 'number' && (c >= 0x110000 || (c >= 0xD800 && c < 0xE000))) throw new Error(`expected a valid Unicode scalar value, found ${c}`);
}

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(state => wasm.__wbindgen_destroy_closure(state.a, state.b));

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function getArrayJsValueFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    const mem = getDataViewMemory0();
    const result = [];
    for (let i = ptr; i < ptr + 4 * len; i += 4) {
        result.push(wasm.__wbindgen_externrefs.get(mem.getUint32(i, true)));
    }
    wasm.__externref_drop_slice(ptr, len);
    return result;
}

function getArrayU32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

function getClampedArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ClampedArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

let cachedUint8ClampedArrayMemory0 = null;
function getUint8ClampedArrayMemory0() {
    if (cachedUint8ClampedArrayMemory0 === null || cachedUint8ClampedArrayMemory0.byteLength === 0) {
        cachedUint8ClampedArrayMemory0 = new Uint8ClampedArray(wasm.memory.buffer);
    }
    return cachedUint8ClampedArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function makeMutClosure(arg0, arg1, f) {
    const state = { a: arg0, b: arg1, cnt: 1 };
    const real = (...args) => {

        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            state.a = a;
            real._wbg_cb_unref();
        }
    };
    real._wbg_cb_unref = () => {
        if (--state.cnt === 0) {
            wasm.__wbindgen_destroy_closure(state.a, state.b);
            state.a = 0;
            CLOSURE_DTORS.unregister(state);
        }
    };
    CLOSURE_DTORS.register(real, state, state);
    return real;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
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

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasm;
function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    cachedUint8ClampedArrayMemory0 = null;
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
        module_or_path = wasmUrl;
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
