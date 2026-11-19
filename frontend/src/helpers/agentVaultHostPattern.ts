import { z } from "zod";

const HOST_LABELS_RE =
  /^(?:\*\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i;

/** The key the server dedupes on, so `API.Foo.com.` and `api.foo.com:443` collide here too. */
const hostKey = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) return trimmed.toLowerCase();

  let host = trimmed;
  let port = "443";
  const colonIdx = trimmed.lastIndexOf(":");
  if (colonIdx !== -1) {
    host = trimmed.slice(0, colonIdx);
    port = trimmed.slice(colonIdx + 1);
  }

  return `${host.replace(/\.$/, "").toLowerCase()}:${port}`;
};

/**
 * A partial pre-check, so a malformed host is caught on the field that holds it rather than bounced
 * back from a submit. agent-vault-host-pattern-fns.ts stays the grammar of record.
 *
 * `existing` must never contain the value being checked: the duplicate is reported on the second
 * occurrence, matching the server.
 */
export const hostError = (segment: string, existing: string[] = []): string | null => {
  const raw = segment.trim();
  if (!raw) return "Remove the empty entry";
  if (raw.includes("://")) return "Remove the scheme, for example https://";
  if (raw.includes("/"))
    return "A host pattern covers a whole host, so remove everything from the first /";

  if (!raw.startsWith("[")) {
    let host = raw;
    const colonIdx = raw.lastIndexOf(":");
    if (colonIdx !== -1) {
      host = raw.slice(0, colonIdx);
      const port = raw.slice(colonIdx + 1);
      const parsed = Number(port);
      if (!/^\d+$/.test(port) || parsed < 1 || parsed > 65535)
        return `"${raw}" has an invalid port`;
    }

    host = host.replace(/\.$/, "").toLowerCase();
    if (host === "*" || host === "*.") return "Name specific hosts. A bare wildcard is too broad.";
    if (!HOST_LABELS_RE.test(host)) return `"${raw}" is not a valid host`;
  }

  const key = hostKey(raw);
  if (key && existing.some((other) => hostKey(other) === key))
    return `"${raw}" is listed more than once`;

  return null;
};

/** One error slot per host. Each is judged against the hosts before it, never against itself. */
const hostErrors = (hosts: string[]): (string | null)[] =>
  hosts.map((host, index) => hostError(host, hosts.slice(0, index)));

export const addHostListIssues = (
  value: string | undefined,
  ctx: z.RefinementCtx,
  path?: (string | number)[]
) => {
  if (!value) return;

  hostErrors(value.split(",")).forEach((error) => {
    if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error, ...(path && { path }) });
  });
};

export const addHostIssues = (
  hosts: string[],
  ctx: z.RefinementCtx,
  path: (string | number)[] = []
) => {
  hostErrors(hosts).forEach((error, index) => {
    if (error)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: error, path: [...path, index] });
  });
};
