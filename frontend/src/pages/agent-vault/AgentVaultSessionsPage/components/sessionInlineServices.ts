import { nativeTargetText } from "@app/components/agent-vault/nativeServiceMeta";
import { displayHostPattern } from "@app/components/agent-vault/service-sheet/serviceSchema";
import { AgentVaultServiceType } from "@app/hooks/api/agentVault/enums";
import {
  TAgentVaultSession,
  TAgentVaultSessionAccessBundle,
  TAgentVaultSessionInlineService,
  TAgentVaultSessionNamedService,
  TAgentVaultSessionSkill
} from "@app/hooks/api/agentVault/types";

// Where the service reaches, shown the way an access bundle's services are: an MCP server by its URL, and a
// database or SSH service by its address.
export const inlineServiceTarget = (service: TAgentVaultSessionInlineService) => {
  if (service.type === AgentVaultServiceType.Mcp)
    return service.serverUrl.replace(/^https:\/\//i, "");
  if (service.type === AgentVaultServiceType.Http) return displayHostPattern(service.hostPattern);
  return nativeTargetText(service);
};

export const inlineServicesLabel = (count: number) =>
  count === 1 ? "1 inline service" : `${count} inline services`;

export const sessionInlineServices = (session: Pick<TAgentVaultSession, "services">) =>
  session.services.flatMap((service) => (service.isInline ? [service] : []));

export const sessionNamedServices = (session: Pick<TAgentVaultSession, "services">) =>
  session.services.flatMap((service) => (service.isInline ? [] : [service]));

export const inlineSkillsLabel = (count: number) =>
  count === 1 ? "1 inline skill" : `${count} inline skills`;

export const sessionNamedSkills = (session: Pick<TAgentVaultSession, "skills">) =>
  session.skills.filter((skill) => !skill.isInline);

export const sessionInlineSkills = (session: Pick<TAgentVaultSession, "skills">) =>
  session.skills.filter((skill) => skill.isInline);

export type TSessionAccessItem =
  | { kind: "bundle"; bundle: TAgentVaultSessionAccessBundle }
  | { kind: "service"; service: TAgentVaultSessionNamedService }
  | { kind: "inline"; services: TAgentVaultSessionInlineService[] }
  | { kind: "skill"; skill: TAgentVaultSessionSkill }
  | { kind: "inline-skills"; skills: TAgentVaultSessionSkill[] };

// A session's bundle, each project service it names, one more badge for the services it was sent with, then the same
// for its skills.
export const toAccessItems = (
  session: Pick<TAgentVaultSession, "accessBundle" | "services" | "skills">
): TSessionAccessItem[] => {
  const inline = sessionInlineServices(session);
  const inlineSkills = sessionInlineSkills(session);
  return [
    ...(session.accessBundle ? [{ kind: "bundle" as const, bundle: session.accessBundle }] : []),
    ...sessionNamedServices(session).map((service) => ({ kind: "service" as const, service })),
    ...(inline.length ? [{ kind: "inline" as const, services: inline }] : []),
    ...sessionNamedSkills(session).map((skill) => ({ kind: "skill" as const, skill })),
    ...(inlineSkills.length ? [{ kind: "inline-skills" as const, skills: inlineSkills }] : [])
  ];
};
