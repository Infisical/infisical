import type { TProjectFolderGrant } from "@app/hooks/api/projectFolderGrants/types";
import { ProjectType, type UpdateProjectDTO } from "@app/hooks/api/projects/types";
import type { TGetSecretBlindIndexStatusResponse } from "@app/hooks/api/secretInsights/types";
import {
  SecretRotationRuleProvider,
  SecretValidationRuleType,
  type TSecretValidationRule
} from "@app/hooks/api/secretValidationRules/types";

import { createFixtureStore } from "../fixture-store";
import { projectSettingsDemo } from "../project-settings/demo";
import { projectsDemo } from "../projects/demo";
import type { SecretPoliciesAdapter } from "./contract";

const DEMO_PROJECT = "payments-api";

const environment = (projectId: string, slug: string) => ({
  id: `${projectId}-${slug}`,
  slug,
  name: { dev: "Development", staging: "Staging", prod: "Production" }[slug] ?? slug
});

const FOLDERS: Record<string, string[]> = {
  dev: ["/api", "/api/stripe", "/workers", "/shared"],
  staging: ["/api", "/api/stripe", "/workers", "/shared"],
  prod: ["/api", "/api/stripe", "/api/plaid", "/workers", "/shared"]
};

type PoliciesState = {
  rules: TSecretValidationRule[];
  grants: TProjectFolderGrant[];
  blindIndex: Record<string, TGetSecretBlindIndexStatusResponse>;
};

const rule = (
  partial: Partial<TSecretValidationRule> & Pick<TSecretValidationRule, "id" | "name">
): TSecretValidationRule =>
  ({
    projectId: DEMO_PROJECT,
    description: null,
    environment: null,
    secretPath: "/**",
    isActive: true,
    createdAt: "2026-09-14T10:00:00.000Z",
    updatedAt: "2026-10-02T10:00:00.000Z",
    type: SecretValidationRuleType.StaticSecrets,
    ...partial
  }) as TSecretValidationRule;

const grant = (
  id: string,
  targetProjectId: string,
  env: string,
  secretPath: string,
  secretCount: number,
  createdAt: string
): TProjectFolderGrant => ({
  id,
  sourceProjectId: DEMO_PROJECT,
  sourceFolderId: `${env}:${secretPath}`,
  targetProjectId,
  createdAt,
  updatedAt: createdAt,
  folderName: secretPath.split("/").filter(Boolean).pop() ?? "root",
  secretPath,
  environmentName: environment(DEMO_PROJECT, env).name,
  environmentSlug: env,
  targetProjectName: targetProjectId,
  secretCount
});

const store = createFixtureStore<PoliciesState>({
  rules: [
    rule({
      id: "rule-key-naming",
      name: "Key naming",
      description: "Keys use upper snake case.",
      keyConstraints: { regexPattern: "^[A-Z][A-Z0-9_]*$", maxLength: 64 }
    }),
    rule({
      id: "rule-prod-values",
      name: "Production value strength",
      environment: environment(DEMO_PROJECT, "prod"),
      secretPath: "/api/**",
      valueConstraints: { minLength: 24, uniqueAcrossLastVersions: 10 }
    }),
    rule({
      id: "rule-db-rotation",
      name: "Database rotation passwords",
      type: SecretValidationRuleType.SecretRotations,
      providers: [
        SecretRotationRuleProvider.PostgresCredentials,
        SecretRotationRuleProvider.MySqlCredentials
      ],
      passwordConstraints: { minLength: 32, requiredPrefix: "pg_" },
      isActive: false
    })
  ],
  grants: [
    grant("grant-web-prod-root", "web-dashboard", "prod", "/shared", 6, "2026-08-21T16:20:00.000Z"),
    grant(
      "grant-web-prod-stripe",
      "web-dashboard",
      "prod",
      "/api/stripe",
      3,
      "2026-09-03T09:05:00.000Z"
    ),
    grant(
      "grant-core-staging",
      "platform-core",
      "staging",
      "/workers",
      11,
      "2026-10-12T13:40:00.000Z"
    )
  ],
  blindIndex: {}
});

let nextId = 0;
const newId = (prefix: string) => {
  nextId += 1;
  return `${prefix}-${Date.now()}-${nextId}`;
};

const ok = <T>(data: T) => ({ data, isPending: false, error: null });

const toRule = (
  current: TSecretValidationRule | undefined,
  dto: {
    projectId: string;
    type: SecretValidationRuleType;
    name?: string;
    description?: string | null;
    environment?: string | null;
    secretPath?: string;
    isActive?: boolean;
    keyConstraints?: object | null;
    valueConstraints?: object | null;
    providers?: string[];
    passwordConstraints?: object;
  }
): TSecretValidationRule => {
  const { environment: env, keyConstraints, valueConstraints, ...rest } = dto;
  const next = {
    ...current,
    ...Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined)),
    id: current?.id ?? newId("rule"),
    createdAt: current?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isActive: dto.isActive ?? current?.isActive ?? true
  } as Record<string, unknown>;
  if (env !== undefined) next.environment = env ? environment(dto.projectId, env) : null;
  if (keyConstraints !== undefined) next.keyConstraints = keyConstraints ?? undefined;
  if (valueConstraints !== undefined) next.valueConstraints = valueConstraints ?? undefined;
  return next as TSecretValidationRule;
};

export const secretPoliciesDemo: SecretPoliciesAdapter = {
  useGates: () =>
    ok({
      allowCrossProjectSecretSharing: true,
      crossProjectSecretSharingInPlan: true,
      paramsFolderSecretDetectionEnabled: true
    }),
  useValidationRules: (projectId) =>
    ok(store.use().rules.filter((entry) => entry.projectId === projectId)),
  useCreateValidationRule: () => ({
    isPending: false,
    mutateAsync: async (dto) => {
      const created = toRule(undefined, dto);
      store.update((state) => ({ ...state, rules: [...state.rules, created] }));
      return created;
    }
  }),
  useUpdateValidationRule: () => ({
    isPending: false,
    mutateAsync: async ({ ruleId, ...dto }) => {
      const current = store.get().rules.find((entry) => entry.id === ruleId);
      const updated = toRule(current, dto);
      store.update((state) => ({
        ...state,
        rules: state.rules.map((entry) => (entry.id === ruleId ? updated : entry))
      }));
      return updated;
    }
  }),
  useDeleteValidationRule: () => ({
    isPending: false,
    mutateAsync: async ({ ruleId }) => {
      const removed = store.get().rules.find((entry) => entry.id === ruleId);
      store.update((state) => ({
        ...state,
        rules: state.rules.filter((entry) => entry.id !== ruleId)
      }));
      return removed as TSecretValidationRule;
    }
  }),
  useBlindIndexStatus: (projectId) =>
    ok(store.use().blindIndex[projectId] ?? { status: "not-found" as const }),
  useEnableBlindIndex: () => ({
    isPending: false,
    mutateAsync: async ({ projectId }) => {
      const setStatus = (status: TGetSecretBlindIndexStatusResponse["status"]) =>
        store.update((state) => ({
          ...state,
          blindIndex: { ...state.blindIndex, [projectId]: { status } }
        }));
      setStatus("pending");
      window.setTimeout(() => {
        setStatus("completed");
        projectSettingsDemo
          .useUpdateProject()
          .mutateAsync({ projectId, secretBlindIndexEnabled: true } as UpdateProjectDTO);
      }, 2000);
      return { message: "Indexing started" };
    }
  }),
  useFolderGrants: (projectId) =>
    ok(store.use().grants.filter((entry) => entry.sourceProjectId === projectId)),
  useFolderGrantsUsage: (grantIds) => ({
    isChecking: false,
    isError: false,
    total: grantIds.filter((id) => id.includes("prod")).length * 2
  }),
  useCreateFolderGrant: () => ({
    isPending: false,
    mutateAsync: async (dto) => {
      const created = {
        ...grant(
          newId("grant"),
          dto.targetProjectId,
          dto.environment,
          dto.secretPath,
          Math.max(1, dto.secretPath.length % 7),
          new Date().toISOString()
        ),
        sourceProjectId: dto.sourceProjectId
      };
      store.update((state) => ({ ...state, grants: [...state.grants, created] }));
      return created;
    }
  }),
  useDeleteFolderGrant: () => ({
    isPending: false,
    mutateAsync: async ({ grantId }) => {
      const removed = store.get().grants.find((entry) => entry.id === grantId);
      store.update((state) => ({
        ...state,
        grants: state.grants.filter((entry) => entry.id !== grantId)
      }));
      return removed as TProjectFolderGrant;
    }
  }),
  useRevokeFolderGrants: () => ({
    isPending: false,
    mutateAsync: async ({ grants }) => {
      const ids = new Set(grants.map((entry) => entry.id));
      store.update((state) => ({
        ...state,
        grants: state.grants.filter((entry) => !ids.has(entry.id))
      }));
    }
  }),
  useFolders: ({ environment: env, path }) => {
    const prefix = path === "/" ? "/" : `${path}/`;
    const names = (FOLDERS[env] ?? [])
      .filter((folder) => folder.startsWith(prefix) && !folder.slice(prefix.length).includes("/"))
      .map((folder) => folder.slice(prefix.length));
    return ok(names.map((name) => ({ id: `${env}:${prefix}${name}`, name })));
  },
  useShareTargetProjects: () => {
    const query = projectsDemo.useUserProjects();
    return {
      ...query,
      data: query.data?.filter((project) => project.type === ProjectType.SecretManager)
    };
  }
};
