import type { ProjectDeletedEnv, ProjectEnv } from "@app/hooks/api/projects/types";

import { DEMO_SELF_USER_ID, seedAccessState } from "../access/fixtures";
import { createFixtureStore } from "../fixture-store";
import { projectSettingsDemo } from "../project-settings/demo";
import type { ProjectEnvironmentsAdapter } from "./contract";

type ProjectEnvironments = { active: ProjectEnv[]; deleted: ProjectDeletedEnv[] };

const DAY = 86_400_000;
const GRACE_DAYS = 14;

const seededDeleted: Record<string, ProjectDeletedEnv[]> = {
  "payments-api": [
    {
      id: "env-payments-api-qa",
      name: "QA",
      slug: "qa",
      softDeletedAt: new Date(Date.now() - 5 * DAY).toISOString(),
      deleteAfter: new Date(Date.now() + (GRACE_DAYS - 5) * DAY).toISOString(),
      deletedBy: {
        type: "user",
        id: DEMO_SELF_USER_ID,
        email: "sarah@acme.dev",
        username: "sarah@acme.dev",
        firstName: "Sarah",
        lastName: "Lin"
      }
    }
  ]
};

const store = createFixtureStore<Record<string, ProjectEnvironments>>(
  Object.fromEntries(
    seedAccessState().projects.map((project) => [
      project.id,
      { active: project.environments, deleted: seededDeleted[project.id] ?? [] }
    ])
  )
);

const empty: ProjectEnvironments = { active: [], deleted: [] };

const change = (projectId: string, apply: (current: ProjectEnvironments) => ProjectEnvironments) =>
  store.update((state) => ({ ...state, [projectId]: apply(state[projectId] ?? empty) }));

const assertSlugFree = (current: ProjectEnvironments, slug: string, exceptId?: string) => {
  if (
    [...current.active, ...current.deleted].some((env) => env.slug === slug && env.id !== exceptId)
  )
    throw new Error(`An environment with the slug ${slug} already exists`);
};

export const projectEnvironmentsDemo: ProjectEnvironmentsAdapter = {
  useProject: (projectId) => {
    const query = projectSettingsDemo.useProject(projectId);
    const environments = store.use()[projectId];
    if (!query.data || !environments) return query;
    return {
      ...query,
      data: {
        ...query.data,
        environments: environments.active,
        deletedEnvironments: environments.deleted
      }
    };
  },
  useEnvironmentLimit: () => ({ data: 5, isPending: false, error: null }),
  useCreateEnvironment: () => ({
    isPending: false,
    mutateAsync: async ({ projectId, name, slug }) => {
      const environment = { id: `env-${projectId}-${slug}-${Date.now()}`, name, slug };
      change(projectId, (current) => {
        assertSlugFree(current, slug);
        return { ...current, active: [...current.active, environment] };
      });
      return environment;
    }
  }),
  useUpdateEnvironment: () => ({
    isPending: false,
    mutateAsync: async ({ projectId, id, name, slug, position }) => {
      change(projectId, (current) => {
        if (slug !== undefined) assertSlugFree(current, slug, id);
        const active = current.active.map((env) =>
          env.id === id ? { ...env, name: name ?? env.name, slug: slug ?? env.slug } : env
        );
        if (position === undefined) return { ...current, active };
        const moving = active.find((env) => env.id === id);
        if (!moving) return { ...current, active };
        const rest = active.filter((env) => env.id !== id);
        rest.splice(position - 1, 0, moving);
        return { ...current, active: rest };
      });
      return {};
    }
  }),
  useDeleteEnvironment: () => ({
    isPending: false,
    mutateAsync: async ({ projectId, id, hardDelete }) => {
      change(projectId, (current) => {
        const target = [...current.active, ...current.deleted].find((env) => env.id === id);
        const active = current.active.filter((env) => env.id !== id);
        const deleted = current.deleted.filter((env) => env.id !== id);
        if (hardDelete || !target) return { active, deleted };
        const now = Date.now();
        return {
          active,
          deleted: [
            ...deleted,
            {
              id: target.id,
              name: target.name,
              slug: target.slug,
              softDeletedAt: new Date(now).toISOString(),
              deleteAfter: new Date(now + GRACE_DAYS * DAY).toISOString(),
              deletedBy: seededDeleted["payments-api"][0].deletedBy
            }
          ]
        };
      });
      return {};
    }
  }),
  useRestoreEnvironment: () => ({
    isPending: false,
    mutateAsync: async ({ projectId, id }) => {
      change(projectId, (current) => {
        const target = current.deleted.find((env) => env.id === id);
        if (!target) return current;
        return {
          active: [...current.active, { id: target.id, name: target.name, slug: target.slug }],
          deleted: current.deleted.filter((env) => env.id !== id)
        };
      });
      return {};
    }
  })
};
