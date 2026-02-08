// Thank you Claude

const PG_PROTOCOL_VERSION = 196608; // 3.0

const decoder = new TextDecoder();

const readCString = (buf: Uint8Array, start: number): { str: string; next: number } => {
  let end = start;
  while (end < buf.length && buf[end] !== 0) end += 1;
  return { str: decoder.decode(buf.slice(start, end)), next: end + 1 };
};

// ── Outgoing messages ──────────────────────────────────────────────

export const buildStartupMessage = (user: string, database: string): Uint8Array => {
  const enc = new TextEncoder();
  const pairs = [
    ...enc.encode(`user\0${user}\0`),
    ...enc.encode(`database\0${database}\0`),
    0
  ];
  const length = 4 + 4 + pairs.length;
  const buf = new Uint8Array(length);
  const view = new DataView(buf.buffer);
  view.setInt32(0, length, false);
  view.setInt32(4, PG_PROTOCOL_VERSION, false);
  buf.set(new Uint8Array(pairs), 8);
  return buf;
};

export const buildQueryMessage = (sql: string): Uint8Array => {
  const sqlBytes = new TextEncoder().encode(`${sql}\0`);
  const length = 4 + sqlBytes.length;
  const buf = new Uint8Array(1 + length);
  buf[0] = 0x51; // 'Q'
  new DataView(buf.buffer).setInt32(1, length, false);
  buf.set(sqlBytes, 5);
  return buf;
};

export const buildTerminateMessage = (): Uint8Array => {
  const buf = new Uint8Array(5);
  buf[0] = 0x58; // 'X'
  new DataView(buf.buffer).setInt32(1, 4, false);
  return buf;
};

// ── Incoming message types ─────────────────────────────────────────

export type PgMessage =
  | { type: "auth_ok" }
  | { type: "auth_request"; method: number }
  | { type: "param_status"; name: string; value: string }
  | { type: "backend_key"; pid: number; secret: number }
  | { type: "ready"; txStatus: string }
  | { type: "row_description"; fields: string[] }
  | { type: "data_row"; values: (string | null)[] }
  | { type: "command_complete"; tag: string }
  | { type: "error"; severity: string; message: string; code: string; detail: string }
  | { type: "notice"; message: string }
  | { type: "empty_query" }
  | { type: "unknown"; code: number };

// ── Parser ─────────────────────────────────────────────────────────

const parseSingleMessage = (msgType: number, body: Uint8Array): PgMessage => {
  const bv = new DataView(body.buffer, body.byteOffset, body.byteLength);

  switch (msgType) {
    case 0x52: { // 'R' Authentication
      const method = bv.getInt32(0, false);
      if (method === 0) return { type: "auth_ok" };
      return { type: "auth_request", method };
    }
    case 0x53: { // 'S' ParameterStatus
      const { str: name, next } = readCString(body, 0);
      const { str: value } = readCString(body, next);
      return { type: "param_status", name, value };
    }
    case 0x4b: // 'K' BackendKeyData
      return { type: "backend_key", pid: bv.getInt32(0, false), secret: bv.getInt32(4, false) };
    case 0x5a: // 'Z' ReadyForQuery
      return { type: "ready", txStatus: String.fromCharCode(body[0]) };
    case 0x54: { // 'T' RowDescription
      const numFields = bv.getInt16(0, false);
      const fields: string[] = [];
      let off = 2;
      for (let i = 0; i < numFields; i += 1) {
        const { str, next } = readCString(body, off);
        fields.push(str);
        off = next + 18; // table_oid(4) + col_attr(2) + type_oid(4) + type_size(2) + type_mod(4) + format(2)
      }
      return { type: "row_description", fields };
    }
    case 0x44: { // 'D' DataRow
      const numCols = bv.getInt16(0, false);
      const values: (string | null)[] = [];
      let off = 2;
      for (let i = 0; i < numCols; i += 1) {
        const colLen = new DataView(body.buffer, body.byteOffset + off, 4).getInt32(0, false);
        off += 4;
        if (colLen === -1) {
          values.push(null);
        } else {
          values.push(decoder.decode(body.slice(off, off + colLen)));
          off += colLen;
        }
      }
      return { type: "data_row", values };
    }
    case 0x43: { // 'C' CommandComplete
      const { str } = readCString(body, 0);
      return { type: "command_complete", tag: str };
    }
    case 0x45: { // 'E' ErrorResponse
      let severity = "";
      let message = "";
      let code = "";
      let detail = "";
      let off = 0;
      while (off < body.length && body[off] !== 0) {
        const field = String.fromCharCode(body[off]);
        off += 1;
        const { str, next } = readCString(body, off);
        off = next;
        if (field === "S") severity = str;
        else if (field === "M") message = str;
        else if (field === "C") code = str;
        else if (field === "D") detail = str;
      }
      return { type: "error", severity, message, code, detail };
    }
    case 0x4e: { // 'N' NoticeResponse
      let message = "";
      let off = 0;
      while (off < body.length && body[off] !== 0) {
        const field = String.fromCharCode(body[off]);
        off += 1;
        const { str, next } = readCString(body, off);
        off = next;
        if (field === "M") message = str;
      }
      return { type: "notice", message };
    }
    case 0x49: // 'I' EmptyQueryResponse
      return { type: "empty_query" };
    default:
      return { type: "unknown", code: msgType };
  }
};

export const parseMessages = (
  buf: Uint8Array
): { messages: PgMessage[]; remaining: Uint8Array } => {
  const messages: PgMessage[] = [];
  let offset = 0;

  while (offset + 5 <= buf.length) {
    const msgType = buf[offset];
    const msgLen = new DataView(buf.buffer, buf.byteOffset + offset + 1, 4).getInt32(0, false);

    if (offset + 1 + msgLen > buf.length) break; // incomplete

    const body = buf.slice(offset + 5, offset + 1 + msgLen);
    messages.push(parseSingleMessage(msgType, body));
    offset += 1 + msgLen;
  }

  return { messages, remaining: buf.slice(offset) };
};
