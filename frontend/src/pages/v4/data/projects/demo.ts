import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  type DeletedProject,
  type Project,
  type ProjectEnv,
  ProjectType,
  ProjectVersion,
  SearchProjectSortBy
} from "@app/hooks/api/projects/types";

import { V4_DEMO_ORG_ID } from "../../mode";
import { createFixtureStore, fixtureMutation } from "../fixture-store";
import type { ProjectsAdapter, TSearchedProject } from "./contract";

const environments = (projectId: string, slugs: string[]): ProjectEnv[] =>
  slugs.map((slug) => ({
    id: `${projectId}-${slug}`,
    slug,
    name: { dev: "Development", staging: "Staging", prod: "Production" }[slug] ?? slug
  }));

const project = (
  id: string,
  type: ProjectType,
  description: string,
  createdAt: string,
  membership: "direct" | "group" | "none" = "direct"
): TSearchedProject => ({
  __v: 0,
  id,
  name: id,
  slug: id,
  type,
  description,
  orgId: V4_DEMO_ORG_ID,
  version: ProjectVersion.V3,
  upgradeStatus: null,
  createdAt,
  updatedAt: createdAt,
  autoCapitalization: false,
  environments:
    type === ProjectType.SecretManager ? environments(id, ["dev", "staging", "prod"]) : [],
  deletedEnvironments: [],
  pitVersionLimit: 10,
  auditLogsRetentionDays: 90,
  hasDeleteProtection: false,
  secretSharing: true,
  showSnapshotsLegacy: false,
  secretDetectionIgnoreValues: [],
  enforceEncryptedSecretManagerSecretMetadata: false,
  secretBlindIndexEnabled: false,
  isLegacyAdditionalPrivilegesEnabled: false,
  isMember: membership !== "none",
  isDirectMember: membership === "direct"
});

type ProjectsState = {
  projects: TSearchedProject[];
  favorites: string[];
  requests: Map<string, Date>;
  deleted: DeletedProject[];
};

const store = createFixtureStore<ProjectsState>({
  projects: [
    project(
      "payments-api",
      ProjectType.SecretManager,
      "Card processing and payout services",
      "2025-02-11T09:30:00Z"
    ),
    project(
      "web-dashboard",
      ProjectType.SecretManager,
      "Customer-facing dashboard and its edge functions",
      "2025-05-06T14:10:00Z",
      "group"
    ),
    project(
      "platform-core",
      ProjectType.SecretManager,
      "Shared infrastructure, queues and service mesh",
      "2024-11-19T08:00:00Z"
    ),
    project("data-pipeline", ProjectType.SecretManager, "", "2026-01-27T16:45:00Z", "none"),
    project(
      "mobile-app",
      ProjectType.SecretManager,
      "iOS and Android release keys",
      "2026-06-02T11:20:00Z",
      "none"
    ),
    project(
      "kms-keys",
      ProjectType.KMS,
      "Encryption and signing keys for production services",
      "2025-03-14T10:05:00Z"
    ),
    project(
      "edge-signing",
      ProjectType.KMS,
      "Signing keys for edge workers",
      "2026-04-22T13:00:00Z"
    ),
    project("hsm-vault", ProjectType.KMS, "HSM-backed root keys", "2025-09-08T07:40:00Z", "none"),
    project(
      "agent-platform",
      ProjectType.AgentVault,
      "Release, eval and engineering agents",
      "2026-10-30T09:00:00Z"
    ),
    project(
      "support-agents",
      ProjectType.AgentVault,
      "Agents that triage and hand off support tickets",
      "2026-11-02T15:30:00Z"
    )
  ],
  favorites: ["payments-api"],
  requests: new Map([["mobile-app", new Date("2026-11-02T17:12:00Z")]]),
  deleted: [
    {
      id: "legacy-monolith",
      name: "legacy-monolith",
      type: ProjectType.SecretManager,
      softDeletedAt: "2026-10-28T15:00:00Z",
      deleteAfter: "2026-11-27T15:00:00Z",
      deletedBy: {
        type: "user",
        id: "user-sarah",
        email: "sarah@acme.dev",
        username: "sarah@acme.dev",
        firstName: "Sarah",
        lastName: "Lin"
      }
    }
  ]
});

const ok = <T>(data: T) => ({ data, isPending: false, error: null });

const sortValue = (entry: Project, orderBy: SearchProjectSortBy) => {
  if (orderBy === SearchProjectSortBy.CreatedAt) return entry.createdAt;
  if (orderBy === SearchProjectSortBy.Description) return entry.description ?? "";
  return entry.name;
};

const update = (change: (state: ProjectsState) => Partial<ProjectsState>) =>
  store.update((state) => ({ ...state, ...change(state) }));

const setMembership = (projectId: string, patch: Partial<TSearchedProject>) =>
  update((state) => ({
    projects: state.projects.map((entry) =>
      entry.id === projectId ? { ...entry, ...patch } : entry
    )
  }));

export const projectsDemo: ProjectsAdapter = {
  useUserProjects: () => ok(store.use().projects.filter((entry) => entry.isMember)),
  useSearchProjects: ({
    name,
    type,
    limit = 50,
    offset = 0,
    orderBy = SearchProjectSortBy.Name,
    orderDirection = OrderByDirection.ASC
  }) => {
    const needle = name?.trim().toLowerCase();
    const matched = store
      .use()
      .projects.filter(
        (entry) =>
          (!type || entry.type === type) && (!needle || entry.name.toLowerCase().includes(needle))
      )
      .sort(
        (a, b) =>
          sortValue(a, orderBy).localeCompare(sortValue(b, orderBy)) *
          (orderDirection === OrderByDirection.ASC ? 1 : -1)
      );
    return ok({ projects: matched.slice(offset, offset + limit), totalCount: matched.length });
  },
  useMyPendingAccessRequests: () => ok(store.use().requests),
  useProjectFavorites: () => ok(store.use().favorites),
  useUpdateProjectFavorites: fixtureMutation(({ projectFavorites }) =>
    update(() => ({ favorites: projectFavorites }))
  ),
  useCreateProject: fixtureMutation(({ projectName, projectDescription, type }) => {
    const created = project(projectName, type, projectDescription ?? "", new Date().toISOString());
    update((state) => ({ projects: [...state.projects, created] }));
    return { data: { project: created } };
  }),
  useRequestProjectAccess: fixtureMutation(({ projectId }) =>
    update((state) => ({ requests: new Map(state.requests).set(projectId, new Date()) }))
  ),
  useLeaveProject: fixtureMutation(({ projectId }) =>
    setMembership(projectId, { isMember: false, isDirectMember: false })
  ),
  useOrgAdminAccessProject: fixtureMutation(({ projectId }) =>
    setMembership(projectId, { isMember: true, isDirectMember: true })
  ),
  useDeletedProjects: (type) => ({
    ...ok(store.use().deleted.filter((entry) => !type || entry.type === type)),
    refetch: () => undefined
  }),
  useRestoreProject: fixtureMutation(({ projectId }) =>
    update((state) => {
      const restored = state.deleted.find((entry) => entry.id === projectId);
      return {
        deleted: state.deleted.filter((entry) => entry.id !== projectId),
        projects: restored
          ? [...state.projects, project(restored.name, restored.type, "", restored.softDeletedAt)]
          : state.projects
      };
    })
  ),
  usePermanentlyDeleteProject: fixtureMutation(({ projectId }) =>
    update((state) => ({ deleted: state.deleted.filter((entry) => entry.id !== projectId) }))
  )
};

export const demoProjectCount = (type: ProjectType) =>
  store.get().projects.filter((entry) => entry.type === type).length;
