import { NATIVE_SERVICE_META } from "@app/components/agent-vault/nativeServiceMeta";
import {
  AgentVaultServiceType,
  isNativeServiceType,
  sessionLogRecordKey
} from "@app/hooks/api/agentVault";
import {
  TAgentVaultSessionLogGap,
  TAgentVaultSessionLogGapReason,
  TAgentVaultSessionLogMcpCall,
  TAgentVaultSessionLogNativeDetail,
  TAgentVaultSessionLogRecord
} from "@app/hooks/api/agentVault/types";

type TMeasuredRow = { key: string | number | bigint; start: number };

// Rows are as tall as their details, so the reader's place is the row at the top of the viewport and how far into
// it they have scrolled, not an index. Returns where to scroll so that row sits where it was once the rows have
// changed around it, and how many rows now sit above it. Null when the row is gone, so the scroll is left alone.
export const followSessionLogRowAnchor = (
  before: TMeasuredRow[],
  after: TMeasuredRow[],
  scrollTop: number
): { scrollTop: number; index: number } | null => {
  let low = 0;
  let high = before.length - 1;
  let top = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (before[middle].start <= scrollTop) {
      top = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (top < 0) return null;
  const { key, start } = before[top];
  const index = after.findIndex((row) => row.key === key);
  if (index < 0) return null;
  return { scrollTop: after[index].start + scrollTop - start, index };
};

// Only rows stamped after `since` count, so rows a filter change reveals or an older page brings in aren't new.
export const countSessionLogArrivals = (
  records: TAgentVaultSessionLogRecord[],
  arrivals: Map<string, number>,
  since: number
) => records.filter((record) => (arrivals.get(sessionLogRecordKey(record)) ?? 0) > since).length;

const HTTP_STATUS_TEXT: Record<number, string> = {
  100: "Continue",
  101: "Switching Protocols",
  102: "Processing",
  103: "Early Hints",
  200: "OK",
  201: "Created",
  202: "Accepted",
  203: "Non-Authoritative Information",
  204: "No Content",
  205: "Reset Content",
  206: "Partial Content",
  207: "Multi-Status",
  208: "Already Reported",
  226: "IM Used",
  300: "Multiple Choices",
  301: "Moved Permanently",
  302: "Found",
  303: "See Other",
  304: "Not Modified",
  305: "Use Proxy",
  307: "Temporary Redirect",
  308: "Permanent Redirect",
  400: "Bad Request",
  401: "Unauthorized",
  402: "Payment Required",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  406: "Not Acceptable",
  407: "Proxy Authentication Required",
  408: "Request Timeout",
  409: "Conflict",
  410: "Gone",
  411: "Length Required",
  412: "Precondition Failed",
  413: "Content Too Large",
  414: "URI Too Long",
  415: "Unsupported Media Type",
  416: "Range Not Satisfiable",
  417: "Expectation Failed",
  421: "Misdirected Request",
  422: "Unprocessable Content",
  423: "Locked",
  424: "Failed Dependency",
  425: "Too Early",
  426: "Upgrade Required",
  428: "Precondition Required",
  429: "Too Many Requests",
  431: "Request Header Fields Too Large",
  451: "Unavailable For Legal Reasons",
  500: "Internal Server Error",
  501: "Not Implemented",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
  505: "HTTP Version Not Supported",
  506: "Variant Also Negotiates",
  507: "Insufficient Storage",
  508: "Loop Detected",
  510: "Not Extended",
  511: "Network Authentication Required"
};

export const httpStatusLabel = (status: number) =>
  HTTP_STATUS_TEXT[status] ? `${status} ${HTTP_STATUS_TEXT[status]}` : String(status);

// A chunk ID is a UUIDv7, whose first 48 bits are the time of the chunk's last request.
export const chunkIdTime = (chunkId: string) =>
  new Date(parseInt(chunkId.replace(/-/g, "").slice(0, 12), 16));

// Counts unreadable chunks by reason; how many requests each held is unknown until it is opened.
export const groupSessionLogGaps = (gaps: TAgentVaultSessionLogGap[]) => {
  const byReason = new Map<TAgentVaultSessionLogGapReason, number>();
  gaps.forEach((gap) => byReason.set(gap.reason, (byReason.get(gap.reason) ?? 0) + 1));
  return [...byReason].map(([reason, chunkCount]) => ({ reason, chunkCount }));
};

// Records hold no query string, so a pasted URL is cut back to the host and path it was sent to.
export const sessionLogSearchTerm = (search: string) =>
  search
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[?#].*$/, "");

// Statements and commands keep their ? and #, and rows show them on one line, so they are matched whole with runs of
// whitespace collapsed.
export const nativeSessionLogSearchTerm = (search: string) =>
  search.trim().toLowerCase().replace(/\s+/g, " ");

export const isNativeSessionLogRecord = (record: TAgentVaultSessionLogRecord) =>
  isNativeServiceType(record.serviceType) || record.native !== undefined;

// The proxy writes the type in upper case as the method, as in POSTGRES, so a row whose serviceType is missing can
// still be named.
export const sessionLogMethodLabel = (record: TAgentVaultSessionLogRecord) => {
  if (!isNativeSessionLogRecord(record)) return record.method;
  const type = isNativeServiceType(record.serviceType)
    ? record.serviceType
    : (record.method.toLowerCase() as AgentVaultServiceType);
  return isNativeServiceType(type) ? NATIVE_SERVICE_META[type].label : record.method;
};

const NATIVE_SEARCH_FIELDS = [
  "statement",
  "command",
  "file",
  "stdin",
  "result",
  "output",
  "note"
] as const satisfies (keyof TAgentVaultSessionLogNativeDetail)[];

export const matchesSessionLogSearch = (record: TAgentVaultSessionLogRecord, search: string) => {
  const term = sessionLogSearchTerm(search);
  const nativeTerm = nativeSessionLogSearchTerm(search);
  if (!term && !nativeTerm) return true;
  if (
    nativeTerm &&
    NATIVE_SEARCH_FIELDS.some((field) =>
      nativeSessionLogSearchTerm(record.native?.[field] ?? "").includes(nativeTerm)
    )
  ) {
    return true;
  }
  if (!term) return false;
  const host = record.host.toLowerCase();
  const path = record.path.toLowerCase();
  return [
    host,
    path,
    record.method.toLowerCase(),
    sessionLogMethodLabel(record).toLowerCase(),
    (record.service ?? "").toLowerCase(),
    ...(record.mcp?.calls ?? []).flatMap((call) =>
      [call.method, call.tool ?? ""].map((field) => field.toLowerCase())
    ),
    `${host}${path}`,
    `${host}:${record.port}${path}`
  ].some((field) => field.includes(term));
};

const firstLine = (text?: string) =>
  text
    ?.split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .find(Boolean) ?? "";

// One line for the row: what the agent ran, or failing that the first thing it sent or got back.
export const nativeSessionLogSummary = (record: TAgentVaultSessionLogRecord) => {
  const { native } = record;
  if (!native) return "";
  const text = native.statement ?? native.command ?? native.file;
  if (text) return text.replace(/\s+/g, " ").trim();
  if (native.shell) return "Interactive shell";
  return (
    firstLine(native.stdin) ||
    firstLine(native.output) ||
    firstLine(native.result) ||
    native.note ||
    ""
  );
};

export type TNativeSessionLogSection = {
  label: string;
  value: string;
  isError?: boolean;
};

// PostgreSQL reports a failed statement as `ERROR: ...` and MySQL a statement with no reply as NO_RESPONSE.
const isFailedResult = (result: string) => /^ERROR\b/.test(result) || result === "NO_RESPONSE";

// What the row expands to, in the order it happened. Empty fields are left out rather than shown blank.
export const nativeSessionLogSections = (
  native: TAgentVaultSessionLogNativeDetail
): TNativeSessionLogSection[] =>
  (
    [
      { label: "Statement", value: native.statement },
      { label: "Command", value: native.command },
      { label: "File", value: native.file },
      { label: "Input", value: native.stdin },
      {
        label: "Result",
        value: native.result,
        isError: native.result ? isFailedResult(native.result) : false
      },
      { label: "Output", value: native.output }
    ] as { label: string; value?: string; isError?: boolean }[]
  ).filter((section): section is TNativeSessionLogSection => Boolean(section.value));

// A note can run past its column, such as why a connection was refused or failed, so a row with one expands to it.
export const hasNativeSessionLogDetails = (native?: TAgentVaultSessionLogNativeDetail) =>
  native !== undefined && (nativeSessionLogSections(native).length > 0 || Boolean(native.note));

export const sessionLogMcpCalls = (
  record: TAgentVaultSessionLogRecord
): TAgentVaultSessionLogMcpCall[] => {
  if (record.serviceType !== AgentVaultServiceType.Mcp || !record.mcp?.parsed) return [];
  return record.mcp.calls;
};

export const sessionLogMcpCallsTruncated = (record: TAgentVaultSessionLogRecord) =>
  sessionLogMcpCalls(record).length > 0 && record.mcp?.truncated === true;

const mcpCallLabel = (call: TAgentVaultSessionLogMcpCall) =>
  call.tool ? `${call.tool} (${call.method})` : call.method;

// Only neighbours are merged, so the list still reads in the order the agent sent the calls.
export const groupRepeatedMcpCalls = (calls: TAgentVaultSessionLogMcpCall[]) =>
  calls.reduce<{ label: string; count: number }[]>((groups, call) => {
    const label = mcpCallLabel(call);
    const last = groups.at(-1);
    if (last?.label === label) {
      last.count += 1;
    } else {
      groups.push({ label, count: 1 });
    }
    return groups;
  }, []);

// A truncated batch held at least one call past the recorded ones, so the count is a floor.
export const mcpMoreCallsLabel = (shown: number, truncated: boolean) =>
  truncated ? `${shown + 1}+ more` : `+${shown} more`;

// Safari before 26.2 never fires scrollend, so a scroll cut short there would never end without this.
export const RETURN_TO_TOP_FALLBACK_MS = 1500;

// Ends a smooth scroll to the top once it gets there, finishes, the reader takes over, or the fallback passes.
// Returns a stop that ends it early, which is safe to call more than once.
export const watchReturnToTop = (
  scroller: EventTarget & { scrollTop: number },
  onEnd: () => void
) => {
  const listening = new AbortController();
  let fallback: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    if (listening.signal.aborted) return;
    listening.abort();
    clearTimeout(fallback);
    onEnd();
  };
  const { signal } = listening;
  scroller.addEventListener(
    "scroll",
    () => {
      if (scroller.scrollTop < 1) stop();
    },
    { passive: true, signal }
  );
  scroller.addEventListener("scrollend", stop, { signal });
  scroller.addEventListener("wheel", stop, { passive: true, signal });
  scroller.addEventListener("touchstart", stop, { passive: true, signal });
  fallback = setTimeout(stop, RETURN_TO_TOP_FALLBACK_MS);
  return stop;
};
