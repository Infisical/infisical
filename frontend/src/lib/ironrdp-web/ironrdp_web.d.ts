/* tslint:disable */
/* eslint-disable */

export class ClipboardData {
    free(): void;
    [Symbol.dispose](): void;
    addBinary(mime_type: string, binary: Uint8Array): void;
    addText(mime_type: string, text: string): void;
    constructor();
    isEmpty(): boolean;
    items(): ClipboardItem[];
}

export class ClipboardItem {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    mimeType(): string;
    value(): any;
}

export class DesktopSize {
    free(): void;
    [Symbol.dispose](): void;
    constructor(width: number, height: number);
    height: number;
    width: number;
}

export class DeviceEvent {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    static keyPressed(scancode: number): DeviceEvent;
    static keyReleased(scancode: number): DeviceEvent;
    static mouseButtonPressed(button: number): DeviceEvent;
    static mouseButtonReleased(button: number): DeviceEvent;
    static mouseMove(x: number, y: number): DeviceEvent;
    static unicodePressed(unicode: string): DeviceEvent;
    static unicodeReleased(unicode: string): DeviceEvent;
    static wheelRotations(vertical: boolean, rotation_amount: number, rotation_unit: RotationUnit): DeviceEvent;
}

export class Extension {
    free(): void;
    [Symbol.dispose](): void;
    constructor(ident: string, value: any);
}

export class InputTransaction {
    free(): void;
    [Symbol.dispose](): void;
    addEvent(event: DeviceEvent): void;
    constructor();
}

export class IronError {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    backtrace(): string;
    kind(): IronErrorKind;
    rdcleanpathDetails(): RDCleanPathDetails | undefined;
}

export enum IronErrorKind {
    /**
     * Catch-all error kind
     */
    General = 0,
    /**
     * Incorrect password used
     */
    WrongPassword = 1,
    /**
     * Unable to login to machine
     */
    LogonFailure = 2,
    /**
     * Insufficient permission, server denied access
     */
    AccessDenied = 3,
    /**
     * Something wrong happened when sending or receiving the RDCleanPath message
     */
    RDCleanPath = 4,
    /**
     * Couldn't connect to proxy
     */
    ProxyConnect = 5,
    /**
     * Protocol negotiation failed
     */
    NegotiationFailure = 6,
}

/**
 * Detailed error information for RDCleanPath errors.
 *
 * When an RDCleanPath error occurs, this structure provides granular details
 * about the underlying cause, including HTTP status codes, Windows Socket errors,
 * and TLS alert codes.
 */
export class RDCleanPathDetails {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * HTTP status code if the error originated from an HTTP response.
     *
     * Common values:
     * - 403: Forbidden (e.g., deleted VNET, insufficient permissions)
     * - 404: Not Found
     * - 500: Internal Server Error
     * - 502: Bad Gateway
     * - 503: Service Unavailable
     */
    readonly httpStatusCode: number | undefined;
    /**
     * TLS alert code if the error occurred during TLS handshake.
     *
     * Common values:
     * - 40: Handshake failure
     * - 42: Bad certificate
     * - 45: Certificate expired
     * - 48: Unknown CA
     * - 112: Unrecognized name
     */
    readonly tlsAlertCode: number | undefined;
    /**
     * Windows Socket API (WSA) error code.
     *
     * Common values:
     * - 10013: Permission denied (WSAEACCES) - often indicates deleted/invalid VNET
     * - 10060: Connection timed out (WSAETIMEDOUT)
     * - 10061: Connection refused (WSAECONNREFUSED)
     * - 10051: Network is unreachable (WSAENETUNREACH)
     * - 10065: No route to host (WSAEHOSTUNREACH)
     */
    readonly wsaErrorCode: number | undefined;
}

export class RdpFile {
    free(): void;
    [Symbol.dispose](): void;
    constructor();
    getInt(key: string): number | undefined;
    getStr(key: string): string | undefined;
    insertInt(key: string, value: number): void;
    insertStr(key: string, value: string): void;
    parse(config: string): void;
    write(): string;
}

export enum RotationUnit {
    Pixel = 0,
    Line = 1,
    Page = 2,
}

export class Session {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    applyInputs(transaction: InputTransaction): void;
    desktopSize(): DesktopSize;
    invokeExtension(ext: Extension): any;
    onClipboardPaste(content: ClipboardData): Promise<void>;
    releaseAllInputs(): void;
    resize(width: number, height: number, scale_factor?: number | null, physical_width?: number | null, physical_height?: number | null): void;
    run(): Promise<SessionTerminationInfo>;
    shutdown(): void;
    supportsUnicodeKeyboardShortcuts(): boolean;
    synchronizeLockKeys(scroll_lock: boolean, num_lock: boolean, caps_lock: boolean, kana_lock: boolean): void;
}

export class SessionBuilder {
    free(): void;
    [Symbol.dispose](): void;
    authToken(token: string): SessionBuilder;
    canvasResizedCallback(callback: Function): SessionBuilder;
    connect(): Promise<Session>;
    constructor();
    desktopSize(desktop_size: DesktopSize): SessionBuilder;
    destination(destination: string): SessionBuilder;
    extension(ext: Extension): SessionBuilder;
    forceClipboardUpdateCallback(callback: Function): SessionBuilder;
    password(password: string): SessionBuilder;
    proxyAddress(address: string): SessionBuilder;
    remoteClipboardChangedCallback(callback: Function): SessionBuilder;
    renderCanvas(canvas: HTMLCanvasElement): SessionBuilder;
    serverDomain(server_domain: string): SessionBuilder;
    setCursorStyleCallback(callback: Function): SessionBuilder;
    setCursorStyleCallbackContext(context: any): SessionBuilder;
    username(username: string): SessionBuilder;
}

export class SessionTerminationInfo {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    reason(): string;
}

export function setup(log_level: string): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_rdpfile_free: (a: number, b: number) => void;
    readonly rdpfile_create: () => number;
    readonly rdpfile_parse: (a: number, b: number, c: number) => void;
    readonly rdpfile_write: (a: number) => [number, number];
    readonly rdpfile_insertStr: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly rdpfile_insertInt: (a: number, b: number, c: number, d: number) => void;
    readonly rdpfile_getStr: (a: number, b: number, c: number) => [number, number];
    readonly rdpfile_getInt: (a: number, b: number, c: number) => number;
    readonly __wbg_session_free: (a: number, b: number) => void;
    readonly __wbg_sessionbuilder_free: (a: number, b: number) => void;
    readonly __wbg_sessionterminationinfo_free: (a: number, b: number) => void;
    readonly __wbg_deviceevent_free: (a: number, b: number) => void;
    readonly __wbg_inputtransaction_free: (a: number, b: number) => void;
    readonly __wbg_clipboarddata_free: (a: number, b: number) => void;
    readonly __wbg_clipboarditem_free: (a: number, b: number) => void;
    readonly __wbg_ironerror_free: (a: number, b: number) => void;
    readonly setup: (a: number, b: number) => void;
    readonly session_run: (a: number) => any;
    readonly session_desktopSize: (a: number) => number;
    readonly session_applyInputs: (a: number, b: number) => [number, number];
    readonly session_releaseAllInputs: (a: number) => [number, number];
    readonly session_synchronizeLockKeys: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly session_shutdown: (a: number) => [number, number];
    readonly session_onClipboardPaste: (a: number, b: number) => any;
    readonly session_resize: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly session_supportsUnicodeKeyboardShortcuts: (a: number) => number;
    readonly session_invokeExtension: (a: number, b: number) => [number, number, number];
    readonly sessionbuilder_create: () => number;
    readonly sessionbuilder_username: (a: number, b: number, c: number) => number;
    readonly sessionbuilder_destination: (a: number, b: number, c: number) => number;
    readonly sessionbuilder_serverDomain: (a: number, b: number, c: number) => number;
    readonly sessionbuilder_password: (a: number, b: number, c: number) => number;
    readonly sessionbuilder_proxyAddress: (a: number, b: number, c: number) => number;
    readonly sessionbuilder_authToken: (a: number, b: number, c: number) => number;
    readonly sessionbuilder_desktopSize: (a: number, b: number) => number;
    readonly sessionbuilder_renderCanvas: (a: number, b: any) => number;
    readonly sessionbuilder_setCursorStyleCallback: (a: number, b: any) => number;
    readonly sessionbuilder_setCursorStyleCallbackContext: (a: number, b: any) => number;
    readonly sessionbuilder_remoteClipboardChangedCallback: (a: number, b: any) => number;
    readonly sessionbuilder_forceClipboardUpdateCallback: (a: number, b: any) => number;
    readonly sessionbuilder_canvasResizedCallback: (a: number, b: any) => number;
    readonly sessionbuilder_extension: (a: number, b: number) => number;
    readonly sessionbuilder_connect: (a: number) => any;
    readonly sessionterminationinfo_reason: (a: number) => [number, number];
    readonly deviceevent_mouseButtonPressed: (a: number) => number;
    readonly deviceevent_mouseButtonReleased: (a: number) => number;
    readonly deviceevent_mouseMove: (a: number, b: number) => number;
    readonly deviceevent_wheelRotations: (a: number, b: number, c: number) => number;
    readonly deviceevent_keyPressed: (a: number) => number;
    readonly deviceevent_keyReleased: (a: number) => number;
    readonly deviceevent_unicodePressed: (a: number) => number;
    readonly deviceevent_unicodeReleased: (a: number) => number;
    readonly inputtransaction_create: () => number;
    readonly inputtransaction_addEvent: (a: number, b: number) => void;
    readonly clipboarddata_create: () => number;
    readonly clipboarddata_addText: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly clipboarddata_addBinary: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly clipboarddata_items: (a: number) => [number, number];
    readonly clipboarddata_isEmpty: (a: number) => number;
    readonly clipboarditem_mimeType: (a: number) => [number, number];
    readonly clipboarditem_value: (a: number) => any;
    readonly ironerror_backtrace: (a: number) => [number, number];
    readonly ironerror_kind: (a: number) => number;
    readonly ironerror_rdcleanpathDetails: (a: number) => number;
    readonly __wbg_desktopsize_free: (a: number, b: number) => void;
    readonly __wbg_get_desktopsize_width: (a: number) => number;
    readonly __wbg_set_desktopsize_width: (a: number, b: number) => void;
    readonly __wbg_get_desktopsize_height: (a: number) => number;
    readonly __wbg_set_desktopsize_height: (a: number, b: number) => void;
    readonly desktopsize_create: (a: number, b: number) => number;
    readonly __wbg_rdcleanpathdetails_free: (a: number, b: number) => void;
    readonly rdcleanpathdetails_httpStatusCode: (a: number) => number;
    readonly rdcleanpathdetails_wsaErrorCode: (a: number) => number;
    readonly rdcleanpathdetails_tlsAlertCode: (a: number) => number;
    readonly __wbg_extension_free: (a: number, b: number) => void;
    readonly extension_create: (a: number, b: number, c: any) => number;
    readonly wasm_bindgen__convert__closures_____invoke__hd61d4058787ccc8f: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen__convert__closures_____invoke__h1f53b3858a424e34: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h1f6180b1ad3f7dd7: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h1f6180b1ad3f7dd7_2: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h1f6180b1ad3f7dd7_3: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__he298c70639c77e8b: (a: number, b: number) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h6521812627082f50: (a: number, b: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __externref_drop_slice: (a: number, b: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
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
