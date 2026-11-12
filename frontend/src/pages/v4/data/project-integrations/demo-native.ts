import {
  IntegrationSyncBehavior,
  type TCloudIntegration,
  type TIntegration,
  type TIntegrationWithEnv
} from "@app/hooks/api/integrations/types";

import { createFixtureStore, fixtureMutation } from "../fixture-store";
import type { ProjectIntegrationsAdapter } from "./contract";

type NativeIntegrationsDemo = Pick<
  ProjectIntegrationsAdapter,
  | "useNativeIntegrations"
  | "useNativeIntegration"
  | "useNativeIntegrationOptions"
  | "useOctopusDeployScopeValues"
  | "useSyncNativeIntegration"
  | "useDeleteNativeIntegration"
>;

const loaded = <T>(data: T) => ({ data, isPending: false, error: null });

const option = (slug: string, name: string, image: string): TCloudIntegration => ({
  slug,
  name,
  image,
  isAvailable: true,
  type: "pat",
  clientId: "",
  docsLink: "",
  clientSlug: ""
});

const options: TCloudIntegration[] = [
  option("vercel", "Vercel", "Vercel.png"),
  option("github", "GitHub", "GitHub.png"),
  option("aws-parameter-store", "AWS Parameter Store", "Amazon Web Services.png"),
  option("heroku", "Heroku", "Heroku.png"),
  option("netlify", "Netlify", "Netlify.png")
];

const environments: Record<string, { name: string; slug: string }> = {
  dev: { name: "Development", slug: "dev" },
  staging: { name: "Staging", slug: "staging" },
  prod: { name: "Production", slug: "prod" }
};

const integration = (
  projectId: string,
  id: string,
  slug: string,
  envSlug: string,
  patch: Partial<TIntegration>
): TIntegrationWithEnv => ({
  id,
  isActive: true,
  integration: slug,
  integrationAuthId: `auth-${id}`,
  envId: `${projectId}-${envSlug}`,
  environment: { id: `${projectId}-${envSlug}`, ...environments[envSlug] },
  secretPath: "/",
  createdAt: "2025-02-11T16:20:00Z",
  updatedAt: "2026-11-12T08:42:00Z",
  __v: 0,
  ...patch
});

const store = createFixtureStore<TIntegrationWithEnv[]>([
  integration("payments-api", "int-vercel-prod", "vercel", "prod", {
    app: "payments-checkout",
    targetEnvironment: "production",
    isSynced: true,
    lastUsed: "2026-11-12T08:41:00Z"
  }),
  integration("payments-api", "int-github-actions", "github", "staging", {
    app: "payments-api",
    owner: "acme",
    scope: "github-repo",
    secretPath: "/ci",
    isSynced: false,
    lastUsed: "2026-11-09T19:12:00Z",
    syncMessage: JSON.stringify({ message: "Resource not accessible by integration", status: 403 }),
    metadata: {
      secretSuffix: "_STAGING",
      shouldEnableDelete: false,
      initialSyncBehavior: IntegrationSyncBehavior.PREFER_SOURCE
    } as TIntegration["metadata"]
  }),
  integration("payments-api", "int-aws-ps-prod", "aws-parameter-store", "prod", {
    path: "/payments/prod/",
    region: "us-east-1",
    secretPath: "/backend",
    isSynced: true,
    lastUsed: "2026-11-12T08:40:00Z",
    metadata: {
      kmsKeyId: "alias/payments-prod",
      secretAWSTag: [
        { key: "team", value: "payments" },
        { key: "managed-by", value: "infisical" }
      ],
      shouldDisableDelete: true
    } as TIntegration["metadata"]
  }),
  integration("payments-api", "int-heroku-dev", "heroku", "dev", {
    app: "payments-api-dev"
  })
]);

export const nativeIntegrationsDemo: NativeIntegrationsDemo = {
  useNativeIntegrations: (projectId) =>
    loaded(store.use().filter((entry) => entry.envId.startsWith(`${projectId}-`))),
  useNativeIntegration: (integrationId) => {
    const found = store.use().find((entry) => entry.id === integrationId);
    return { data: found, isPending: false, error: found ? null : new Error("Not found") };
  },
  useNativeIntegrationOptions: () => loaded(options),
  useOctopusDeployScopeValues: () => loaded({}),
  useSyncNativeIntegration: fixtureMutation(({ id }) => {
    store.update((current) =>
      current.map((entry) =>
        entry.id === id
          ? { ...entry, isSynced: true, syncMessage: undefined, lastUsed: new Date().toISOString() }
          : entry
      )
    );
    return {};
  }),
  useDeleteNativeIntegration: fixtureMutation(({ id }) => {
    store.update((current) => current.filter((entry) => entry.id !== id));
    return {};
  })
};
