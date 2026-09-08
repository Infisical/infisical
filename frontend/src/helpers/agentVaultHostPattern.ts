import { z } from "zod";

const HOST_LABELS_RE =
  /^(?:\*\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i;

/**
 * A partial pre-check, so a malformed host is caught on the field that holds it rather than bounced
 * back from a submit. agent-vault-host-pattern.ts stays the grammar of record.
 */
const hostSegmentError = (segment: string, seen: Set<string>): string | null => {
  const raw = segment.trim();
  if (!raw) return "Remove the empty entry";
  if (raw.includes("://")) return "Remove the scheme, for example https://";
  if (raw.includes("/"))
    return "A host pattern covers a whole host, so remove everything from the first /";
  if (raw.startsWith("[")) return null;

  let host = raw;
  let port = "443";
  const colonIdx = raw.lastIndexOf(":");
  if (colonIdx !== -1) {
    host = raw.slice(0, colonIdx);
    port = raw.slice(colonIdx + 1);
    const parsed = Number(port);
    if (!/^\d+$/.test(port) || parsed < 1 || parsed > 65535) return `"${raw}" has an invalid port`;
  }

  host = host.replace(/\.$/, "").toLowerCase();
  if (host === "*" || host === "*.") return "Name specific hosts. A bare wildcard is too broad.";
  if (!HOST_LABELS_RE.test(host)) return `"${raw}" is not a valid host`;

  const key = `${host}:${port}`;
  if (seen.has(key)) return `"${raw}" is listed more than once`;
  seen.add(key);

  return null;
};

export const addHostListIssues = (
  value: string | undefined,
  ctx: z.RefinementCtx,
  path?: (string | number)[]
) => {
  if (!value) return;

  const seen = new Set<string>();
  value.split(",").forEach((segment) => {
    const error = hostSegmentError(segment, seen);
    if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error, ...(path && { path }) });
  });
};
