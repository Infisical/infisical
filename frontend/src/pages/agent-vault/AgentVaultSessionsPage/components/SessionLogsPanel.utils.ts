import { sessionLogRecordKey } from "@app/hooks/api/agentVault";
import {
  TAgentVaultSessionLogGap,
  TAgentVaultSessionLogGapReason,
  TAgentVaultSessionLogRecord
} from "@app/hooks/api/agentVault/types";

// Where the row a reader was looking at moved to once new rows landed above it.
export const findRowShift = (
  before: TAgentVaultSessionLogRecord[],
  after: TAgentVaultSessionLogRecord[],
  index: number
): number | null => {
  const row = before[index];
  if (!row) return null;
  const key = sessionLogRecordKey(row);
  const moved = after.findIndex((candidate) => sessionLogRecordKey(candidate) === key);
  return moved < 0 ? null : moved - index;
};

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

export const matchesSessionLogSearch = (record: TAgentVaultSessionLogRecord, search: string) => {
  const term = sessionLogSearchTerm(search);
  if (!term) return true;
  const host = record.host.toLowerCase();
  const path = record.path.toLowerCase();
  return [
    host,
    path,
    record.method.toLowerCase(),
    (record.service ?? "").toLowerCase(),
    `${host}${path}`,
    `${host}:${record.port}${path}`
  ].some((field) => field.includes(term));
};
