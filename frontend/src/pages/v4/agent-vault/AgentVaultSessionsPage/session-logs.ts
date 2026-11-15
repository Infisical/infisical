import type { IconSource } from "@infisical/cipher/ui/icon";
import { ArrowRightIcon, CircleXIcon, ListIcon, ShieldBanIcon } from "lucide-react";

import {
  AgentVaultServiceType,
  AgentVaultSessionLogDecision,
  AgentVaultSessionStatus,
  isNativeServiceType
} from "@app/hooks/api/agentVault/enums";
import type {
  TAgentVaultSession,
  TAgentVaultSessionLogGap,
  TAgentVaultSessionLogGapReason,
  TAgentVaultSessionLogMcpCall,
  TAgentVaultSessionLogNativeDetail,
  TAgentVaultSessionLogRecord
} from "@app/hooks/api/agentVault/types";
import { sessionLogRecordKey } from "@app/hooks/api/agentVault/useAgentVaultSessionLogTimeline";

import { NATIVE_SERVICE_META } from "../resources/agent-vault-utils";

export type TLogRange = { from: Date; to: Date };

export type TDecisionTone = "ok" | "outline" | "warn" | "bad";

export const DECISION_PRESENTATION: Record<
  AgentVaultSessionLogDecision,
  { label: string; tone: TDecisionTone; icon: IconSource }
> = {
  [AgentVaultSessionLogDecision.Brokered]: { label: "Brokered", tone: "ok", icon: "key" },
  [AgentVaultSessionLogDecision.Passthrough]: {
    label: "Passthrough",
    tone: "outline",
    icon: ArrowRightIcon
  },
  [AgentVaultSessionLogDecision.Blocked]: { label: "Blocked", tone: "warn", icon: ShieldBanIcon },
  [AgentVaultSessionLogDecision.Error]: { label: "Error", tone: "bad", icon: CircleXIcon },
  [AgentVaultSessionLogDecision.Discovery]: {
    label: "Listed services",
    tone: "outline",
    icon: ListIcon
  },
  [AgentVaultSessionLogDecision.Skills]: {
    label: "Fetched skills",
    tone: "outline",
    icon: "book-open"
  }
};

export const decisionPresentation = (decision: AgentVaultSessionLogDecision) =>
  DECISION_PRESENTATION[decision] ?? {
    label: decision || "Unknown",
    tone: "outline" as const,
    icon: "info" as IconSource
  };

export const GAP_EXPLANATION: Record<
  TAgentVaultSessionLogGapReason,
  { one: string; many: string }
> = {
  fetch: { one: "could not be read from the bucket", many: "could not be read from the bucket" },
  missing: { one: "isn't in the bucket", many: "aren't in the bucket" },
  refused: { one: "was refused by the bucket", many: "were refused by the bucket" },
  size: {
    one: "doesn't match what the proxy uploaded",
    many: "don't match what the proxy uploaded"
  },
  gcm: { one: "could not be decrypted", many: "could not be decrypted" },
  json: {
    one: "was decrypted but could not be read",
    many: "were decrypted but could not be read"
  },
  mismatch: {
    one: "holds requests from a different proxy",
    many: "hold requests from a different proxy"
  }
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

// A chunk ID is a UUIDv7, whose first 48 bits are the time of the chunk's last request.
export const chunkIdTime = (chunkId: string) =>
  new Date(parseInt(chunkId.replace(/-/g, "").slice(0, 12), 16));

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

// Statements and commands keep their ? and #, so they are matched whole with runs of whitespace collapsed.
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
  )
    return true;
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

// PostgreSQL reports a failed statement as `ERROR: ...` and MySQL a statement with no reply as NO_RESPONSE.
const isFailedResult = (result: string) => /^ERROR\b/.test(result) || result === "NO_RESPONSE";

export const nativeSessionLogSections = (native: TAgentVaultSessionLogNativeDetail) =>
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
  ).filter((section): section is { label: string; value: string; isError?: boolean } =>
    Boolean(section.value)
  );

export const sessionLogMcpCalls = (
  record: TAgentVaultSessionLogRecord
): TAgentVaultSessionLogMcpCall[] => {
  if (record.serviceType !== AgentVaultServiceType.Mcp || !record.mcp?.parsed) return [];
  return record.mcp.calls;
};

const mcpCallLabel = (call: TAgentVaultSessionLogMcpCall) =>
  call.tool ? `${call.tool} (${call.method})` : call.method;

// Only neighbours are merged, so the list still reads in the order the agent sent the calls.
export const groupRepeatedMcpCalls = (calls: TAgentVaultSessionLogMcpCall[]) =>
  calls.reduce<{ label: string; count: number }[]>((groups, call) => {
    const label = mcpCallLabel(call);
    const last = groups.at(-1);
    if (last?.label === label) last.count += 1;
    else groups.push({ label, count: 1 });
    return groups;
  }, []);

// A truncated batch held at least one call past the recorded ones, so the count is a floor.
export const mcpMoreCallsLabel = (shown: number, truncated: boolean) =>
  truncated ? `${shown + 1}+ more` : `+${shown} more`;

export const sessionLogRequestSummary = (record: TAgentVaultSessionLogRecord) => {
  if (isNativeSessionLogRecord(record)) return nativeSessionLogSummary(record);
  const [first, ...rest] = sessionLogMcpCalls(record);
  if (!first) return record.path;
  const label = first.tool ?? first.method;
  return rest.length || record.mcp?.truncated
    ? `${label} ${mcpMoreCallsLabel(rest.length, record.mcp?.truncated === true)}`
    : label;
};

// Agent Vault answers Blocked and Error requests itself, so their statuses don't come from the host the request named.
export const isProxyAnswered = (decision: AgentVaultSessionLogDecision) =>
  decision === AgentVaultSessionLogDecision.Blocked ||
  decision === AgentVaultSessionLogDecision.Error;

export const isSessionEndpoint = (decision: AgentVaultSessionLogDecision) =>
  decision === AgentVaultSessionLogDecision.Discovery ||
  decision === AgentVaultSessionLogDecision.Skills;

export const outcomeDescription = (record: TAgentVaultSessionLogRecord) => {
  if (record.decision === AgentVaultSessionLogDecision.Discovery)
    return record.status === 200
      ? "The agent asked Agent Vault which services this session can use, and Agent Vault listed them."
      : `The agent asked Agent Vault which services this session can use, and Agent Vault returned ${httpStatusLabel(record.status)}.`;
  if (record.decision === AgentVaultSessionLogDecision.Skills)
    return record.status === 200
      ? "Agent Vault got this session's skills from Infisical."
      : `Agent Vault asked Infisical for this session's skills, and Infisical returned ${httpStatusLabel(record.status)}.`;
  if (record.hook && record.decision === AgentVaultSessionLogDecision.Error)
    return "The hook didn't give a usable answer, so the request wasn't sent.";
  if (record.hook && record.decision === AgentVaultSessionLogDecision.Blocked)
    return record.hook.reason
      ? `The hook refused this request: ${record.hook.reason}`
      : "The hook refused this request.";
  const answer = `Agent Vault returned ${httpStatusLabel(record.status)}`;
  return record.decision === AgentVaultSessionLogDecision.Blocked
    ? `${answer} without sending this request to ${record.host}.`
    : `${answer} with no response from ${record.host}.`;
};

export const sessionLogAddress = (record: TAgentVaultSessionLogRecord) => {
  const host = record.host.includes(":") ? `[${record.host}]` : record.host;
  return `${host}:${record.port}`;
};

// A proxy uploads what it still holds on its next flush, up to a minute after the session ends, so the view keeps
// checking for new requests a while longer.
export const SESSION_END_TAIL_MS = 2 * 60_000;

export const sessionEndTailDeadline = (session: TAgentVaultSession) => {
  const endedAt =
    session.revokedAt ??
    (session.status === AgentVaultSessionStatus.Expired ? session.expiresAt : null);
  return endedAt ? new Date(endedAt).getTime() + SESSION_END_TAIL_MS : null;
};

// Only rows stamped after `since` count, so rows a filter change reveals or an older page brings in aren't new.
export const countSessionLogArrivals = (
  records: TAgentVaultSessionLogRecord[],
  arrivals: Map<string, number>,
  since: number
) => records.filter((record) => (arrivals.get(sessionLogRecordKey(record)) ?? 0) > since).length;
