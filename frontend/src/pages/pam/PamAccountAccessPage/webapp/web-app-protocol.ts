export const WEB_APP_MAX_FRAME_BYTES = 1024 * 1024 + 64;
export type TWebAppFrame = {
  type: "frame";
  surfaceSeq: number;
  frameSeq: number;
  width: number;
  height: number;
  viewportGen: number;
  controllerGen: number;
  captureElapsedUs: number;
  jpeg: Uint8Array<ArrayBuffer>;
};
export type TWebAppControl = { type: "control"; data: { t: string; [key: string]: unknown } };
export const parseWebAppFrame = (bytes: ArrayBuffer): TWebAppFrame | TWebAppControl => {
  if (bytes.byteLength < 2 || bytes.byteLength > WEB_APP_MAX_FRAME_BYTES)
    throw new Error("Invalid browser frame length");
  const view = new DataView(bytes);
  const type = view.getUint8(0);
  if (type === 1) {
    if (bytes.byteLength > 64 * 1024 + 1) throw new Error("Browser control is too large");
    const data: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes, 1))
    );
    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      !("t" in data) ||
      typeof data.t !== "string" ||
      data.t === "attach" ||
      data.t === "ack" ||
      data.t === "paste"
    )
      throw new Error("Invalid browser control");
    if (data.t === "attached" && (!("v" in data) || data.v !== 1))
      throw new Error("Unsupported browser protocol version");
    return { type: "control", data: data as TWebAppControl["data"] };
  }
  if (type !== 2 || bytes.byteLength <= 29 || bytes.byteLength > 29 + 1024 * 1024)
    throw new Error("Invalid browser frame type");
  const width = view.getUint16(9),
    height = view.getUint16(11);
  const captureElapsedUs = Number(view.getBigUint64(21));
  if (!width || !height || width > 1920 || height > 1200 || !Number.isSafeInteger(captureElapsedUs))
    throw new Error("Invalid browser frame dimensions or timestamp");
  return {
    type: "frame",
    surfaceSeq: view.getUint32(1),
    frameSeq: view.getUint32(5),
    width,
    height,
    viewportGen: view.getUint32(13),
    controllerGen: view.getUint32(17),
    captureElapsedUs,
    jpeg: new Uint8Array(bytes.slice(29))
  };
};
export const encodeWebAppMessage = (
  type: "input" | "control",
  data: Record<string, unknown>
): Uint8Array<ArrayBuffer> => {
  const json = new TextEncoder().encode(JSON.stringify(data));
  if (json.length > (type === "input" ? 4096 : 65536))
    throw new Error("Browser message is too large");
  const bytes = new Uint8Array(json.length + 1);
  bytes[0] = type === "control" ? 1 : 3;
  bytes.set(json, 1);
  return bytes;
};
export const isCurrentWebAppFrame = (
  frame: TWebAppFrame,
  state: { surfaceSeq: number; viewportGen: number; controllerGen: number }
) =>
  frame.surfaceSeq === state.surfaceSeq &&
  frame.viewportGen === state.viewportGen &&
  frame.controllerGen === state.controllerGen;
export const remoteCoordinates = (
  x: number,
  y: number,
  rect: { left: number; top: number; width: number; height: number },
  viewport: { width: number; height: number }
) => ({
  x: Math.max(
    0,
    Math.min(viewport.width - 1, Math.round(((x - rect.left) * viewport.width) / rect.width))
  ),
  y: Math.max(
    0,
    Math.min(viewport.height - 1, Math.round(((y - rect.top) * viewport.height) / rect.height))
  )
});
