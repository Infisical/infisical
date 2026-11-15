import { AgentVaultServiceType, isNativeServiceType } from "@app/hooks/api/agentVault/enums";
import type {
  TAgentVaultAccessBundleListItem,
  TAgentVaultMember,
  TAgentVaultProxy,
  TAgentVaultService,
  TAgentVaultSession,
  TAgentVaultSkill,
  TAgentVaultSkillFile,
  TAgentVaultSkillVersion,
  TAgentVaultVariable
} from "@app/hooks/api/agentVault/types";

import { createFixtureStore } from "./fixture-store";

export type TDemoBundle = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  serviceIds: string[];
  skillIds: string[];
  members: TAgentVaultMember[];
};

export type TDemoSkill = {
  skill: Omit<TAgentVaultSkill, "accessBundles">;
  versions: (TAgentVaultSkillVersion & { files: TAgentVaultSkillFile[] })[];
};

export type TDemoProject = {
  bundles: TDemoBundle[];
  services: TAgentVaultService[];
  variables: TAgentVaultVariable[];
  skills: TDemoSkill[];
  proxies: TAgentVaultProxy[];
  sessions: TAgentVaultSession[];
};

type TDemoState = { projects: Record<string, TDemoProject>; counter: number };

const EMPTY_PROJECT: TDemoProject = {
  bundles: [],
  services: [],
  variables: [],
  skills: [],
  proxies: [],
  sessions: []
};

export const agentVaultDemoStore = createFixtureStore<TDemoState>({ projects: {}, counter: 100 });

export const demoProject = (state: TDemoState, projectId: string) =>
  state.projects[projectId] ?? EMPTY_PROJECT;

export const updateDemoProject = (
  projectId: string,
  change: (project: TDemoProject) => TDemoProject
) =>
  agentVaultDemoStore.update((state) => ({
    ...state,
    projects: { ...state.projects, [projectId]: change(demoProject(state, projectId)) }
  }));

export const seedDemoProject = (projectId: string, seed: Partial<TDemoProject>) =>
  updateDemoProject(projectId, (project) => ({ ...project, ...seed }));

const hostPatternsOf = (service: TAgentVaultService) =>
  service.type === AgentVaultServiceType.Http || service.type === AgentVaultServiceType.Mcp
    ? service.hostPattern.split(",").map((host) => host.trim())
    : [];

export const demoBundleServices = (project: TDemoProject, bundle: TDemoBundle) =>
  bundle.serviceIds
    .map((id) => project.services.find((service) => service.id === id))
    .filter((service): service is TAgentVaultService => Boolean(service));

export const demoBundleListItem = (
  project: TDemoProject,
  bundle: TDemoBundle
): TAgentVaultAccessBundleListItem => {
  const services = demoBundleServices(project, bundle);
  return {
    id: bundle.id,
    name: bundle.name,
    description: bundle.description,
    createdAt: bundle.createdAt,
    updatedAt: bundle.updatedAt,
    serviceCount: services.length,
    memberCount: bundle.members.length,
    hostPatterns: [...new Set(services.flatMap(hostPatternsOf))],
    nativeServices: services
      .filter((service) => isNativeServiceType(service.type))
      .map((service) => ({ name: service.name, type: service.type })),
    servicesRequiringSetup: services
      .filter((service) => Boolean(service.personalValues && !service.personalValues.isConfigured))
      .map((service) => ({ id: service.id, name: service.name }))
  };
};
