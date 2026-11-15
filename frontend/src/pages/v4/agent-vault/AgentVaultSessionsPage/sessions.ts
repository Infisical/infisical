import { format, formatDistanceToNowStrict } from "date-fns";
import { z } from "zod";

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

export const canEditSessionLabel = (session: TAgentVaultSession) =>
  session.actor.id !== null && session.onBehalfOf?.id !== null;

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

export const SESSION_LABEL_MAX_LENGTH = 128;

const DISALLOWED_LABEL_CHARS_RE = /[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{Zl}\p{Zp}]/u;

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
