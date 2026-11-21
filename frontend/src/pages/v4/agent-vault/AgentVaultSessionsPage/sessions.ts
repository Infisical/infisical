import { format, formatDistanceToNowStrict } from "date-fns";
import { z } from "zod";

import { canActOnAgentVaultSession } from "@app/helpers/agentVaultPermissions";
import {
  AgentVaultMemberType,
  AgentVaultServiceType,
  AgentVaultSessionStatus
} from "@app/hooks/api/agentVault/enums";
import type {
  TAgentVaultSession,
  TAgentVaultSessionActor,
  TAgentVaultSessionInlineService
} from "@app/hooks/api/agentVault/types";

import type { MetadataEntry } from "../../access/org/metadata-editor";
import { useProjectPermission } from "../../access/permissions";
import { useV4Session } from "../../data/session/contract";

const DOCS = "https://infisical.com/docs/documentation/platform/agent-vault";

export const AGENT_VAULT_DOCS = {
  sessions: `${DOCS}/sessions`,
  modalGuide: `${DOCS}/guides/modal`,
  daytonaGuide: `${DOCS}/guides/daytona`,
  e2bGuide: `${DOCS}/guides/e2b`,
  dockerGuide: `${DOCS}/guides/docker`,
  kubernetesSetupGuide: `${DOCS}/guides/kubernetes-setup`,
  cursorGuide: `${DOCS}/guides/cursor`
} as const;

export const SESSION_STATUS: Record<
  AgentVaultSessionStatus,
  { label: string; tone: "ok" | "bad" | "neutral"; icon: "check-c" | "x" | "clock" }
> = {
  [AgentVaultSessionStatus.Active]: { label: "Active", tone: "ok", icon: "check-c" },
  [AgentVaultSessionStatus.Revoked]: { label: "Revoked", tone: "bad", icon: "x" },
  [AgentVaultSessionStatus.Expired]: { label: "Expired", tone: "neutral", icon: "clock" }
};

export const actorName = (actor: TAgentVaultSessionActor) => {
  if (actor.type !== AgentVaultMemberType.User) return actor.name;
  const fullName = [actor.firstName, actor.lastName].filter(Boolean).join(" ");
  return fullName || actor.username || actor.email || "Unknown";
};

export const actorSubtitle = (actor: TAgentVaultSessionActor) =>
  actor.type === AgentVaultMemberType.User ? actor.email || actor.username : null;

export const describeActor = (actor: TAgentVaultSessionActor) => {
  const name = actorName(actor);
  if (actor.id === null) return `"${name}" was deleted`;
  if (actor.type === AgentVaultMemberType.MachineIdentity) return `${actor.id} (machine identity)`;
  const subtitle = actorSubtitle(actor);
  return name === subtitle ? subtitle : `${name} (${subtitle})`;
};

export const describeSession = (session: TAgentVaultSession) =>
  session.label
    ? `"${session.label}" for "${actorName(session.actor)}"`
    : `for "${actorName(session.actor)}"`;

export const canEditSession = (session: TAgentVaultSession) =>
  session.actor.id !== null && session.onBehalfOf?.id !== null;

export const useCanActOnSession = (projectId: string) => {
  const { permission } = useProjectPermission(projectId);
  const { user } = useV4Session();
  return (session: TAgentVaultSession, change: "edit" | "revoke") =>
    canActOnAgentVaultSession(permission, user.id, session, change);
};

export const formatTimestamp = (value: string) => format(new Date(value), "MMM d, yyyy h:mm a");

export const formatSessionExpiry = (expiresAt: string) => {
  const expiry = new Date(expiresAt);
  const hasPassed = expiry.getTime() <= Date.now();
  return `${hasPassed ? "" : "in "}${formatDistanceToNowStrict(expiry, { addSuffix: hasPassed })}`;
};

const displayHostPattern = (hostPattern: string) =>
  hostPattern
    .split(",")
    .map((host) => host.trim().replace(/:443$/, ""))
    .join(", ");

export const inlineServiceTarget = (service: TAgentVaultSessionInlineService) => {
  if (service.type === AgentVaultServiceType.Mcp)
    return service.serverUrl.replace(/^https:\/\//i, "");
  if (service.type === AgentVaultServiceType.Http) return displayHostPattern(service.hostPattern);
  const host = service.host.includes(":") ? `[${service.host}]` : service.host;
  const address = service.port ? `${host}:${service.port}` : host;
  return "database" in service && service.database ? `${address}/${service.database}` : address;
};

export const inlineServicesLabel = (count: number) =>
  count === 1 ? "1 inline service" : `${count} inline services`;

export const sessionInlineServices = (session: Pick<TAgentVaultSession, "services">) =>
  session.services.flatMap((service) => (service.isInline ? [service] : []));

export const sessionNamedServices = (session: Pick<TAgentVaultSession, "services">) =>
  session.services.flatMap((service) => (service.isInline ? [] : [service]));

export const isSessionServicesError = (message: string) =>
  message.includes("both cover") || message.includes("can't name a service");

export const SESSION_LABEL_MAX_LENGTH = 128;

const DISALLOWED_LABEL_CHARS_RE = /[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{Zl}\p{Zp}]/u;

const SESSION_METADATA_MAX_KEYS = 20;
const SESSION_METADATA_KEY_MAX_LENGTH = 255;
const SESSION_METADATA_VALUE_MAX_LENGTH = 1020;

const isBlankRow = (row: MetadataEntry) => !row.key.trim() && !row.value.trim();

export const sessionMetadataRowsSchema = z
  .object({
    key: z
      .string()
      .trim()
      .max(
        SESSION_METADATA_KEY_MAX_LENGTH,
        `A key can be at most ${SESSION_METADATA_KEY_MAX_LENGTH} characters`
      )
      .refine(
        (key) => !DISALLOWED_LABEL_CHARS_RE.test(key),
        "A key can't contain line breaks, tabs, or invisible characters."
      )
      .refine((key) => !key.includes("="), "A key can't contain ="),
    value: z
      .string()
      .trim()
      .max(
        SESSION_METADATA_VALUE_MAX_LENGTH,
        `A value can be at most ${SESSION_METADATA_VALUE_MAX_LENGTH} characters`
      )
      .refine(
        (value) => !DISALLOWED_LABEL_CHARS_RE.test(value),
        "A value can't contain line breaks, tabs, or invisible characters."
      )
  })
  .array()
  .superRefine((rows, ctx) => {
    const seenKeys = new Set<string>();
    let filledCount = 0;
    rows.forEach((row, index) => {
      if (isBlankRow(row)) return;
      filledCount += 1;
      if (!row.key) {
        ctx.addIssue({
          code: "custom",
          path: [index, "key"],
          message: "Enter a key, or remove this row."
        });
        return;
      }
      if (!row.value)
        ctx.addIssue({ code: "custom", path: [index, "value"], message: "Enter a value" });
      if (seenKeys.has(row.key))
        ctx.addIssue({
          code: "custom",
          path: [index, "key"],
          message: `The metadata key '${row.key}' appears more than once. Each key can be used once per session.`
        });
      seenKeys.add(row.key);
    });
    if (filledCount > SESSION_METADATA_MAX_KEYS)
      ctx.addIssue({
        code: "custom",
        message: `A session can have at most ${SESSION_METADATA_MAX_KEYS} metadata keys.`
      });
  });

export type TMetadataErrors = {
  rows: { key?: string; value?: string }[];
  list?: string;
};

export const sessionMetadataErrors = (rows: MetadataEntry[]): TMetadataErrors | undefined => {
  const result = sessionMetadataRowsSchema.safeParse(rows);
  if (result.success) return undefined;
  const errors: TMetadataErrors = { rows: rows.map(() => ({})) };
  result.error.issues.forEach(({ path: [row, field], message }) => {
    if (typeof row !== "number") errors.list ??= message;
    else if (field === "key" || field === "value") errors.rows[row][field] ??= message;
  });
  return errors;
};

export const metadataRowsToRecord = (rows: MetadataEntry[]): Record<string, string> =>
  Object.fromEntries(
    rows.filter((row) => !isBlankRow(row)).map((row) => [row.key.trim(), row.value.trim()])
  );

export const metadataRecordToRows = (metadata: Record<string, string>): MetadataEntry[] =>
  Object.entries(metadata).map(([key, value]) => ({ key, value }));

export const isSameSessionMetadata = (a: Record<string, string>, b: Record<string, string>) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => b[key] === a[key]);
};

export const sessionLabelSchema = z
  .string()
  .trim()
  .max(SESSION_LABEL_MAX_LENGTH, `A label can be at most ${SESSION_LABEL_MAX_LENGTH} characters`)
  .refine(
    (label) => !DISALLOWED_LABEL_CHARS_RE.test(label),
    "A label can't contain line breaks, tabs, or invisible characters such as zero-width spaces or text direction marks."
  );

export const currentSiteUrl = () => {
  const { protocol, hostname, port } = window.location;
  return `${protocol}//${hostname}${port && port !== "80" ? `:${port}` : ""}`;
};
