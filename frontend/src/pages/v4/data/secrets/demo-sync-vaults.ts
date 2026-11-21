import type { TOnePassVault } from "@app/hooks/api/appConnections/1password";
import type { TChefDataBagItem } from "@app/hooks/api/appConnections/chef";
import type {
  TRemoteInfisicalEnvironmentFolderTree,
  TRemoteInfisicalProject
} from "@app/hooks/api/appConnections/external-infisical";
import type { TKeeperSharedFolder } from "@app/hooks/api/appConnections/keeper";

import type { SyncVaultsLookups } from "./contract-sync-vaults";
import { listOf, ready } from "./demo-options";

const DEMO_ONE_PASSWORD_VAULTS: TOnePassVault[] = [
  ["acme-demo-engineering", "Engineering", 24],
  ["acme-demo-shared", "Shared", 8],
  ["acme-demo-infrastructure", "Infrastructure", 15]
].map(([id, name, items]) => ({
  id: id as string,
  name: name as string,
  type: "USER_CREATED",
  items: items as number,
  attributeVersion: 1,
  contentVersion: 1,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-20T00:00:00Z"
}));

const DEMO_HC_VAULT_MOUNTS = ["secret", "acme-demo-kv", "acme-demo-payments"];

const DEMO_KEEPER_SHARED_FOLDERS: TKeeperSharedFolder[] = [
  { uid: "acme-demo-folder-engineering", name: "Engineering secrets" },
  { uid: "acme-demo-folder-platform", name: "Platform credentials" }
];

const DEMO_EXTERNAL_INFISICAL_PROJECTS: TRemoteInfisicalProject[] = [
  {
    id: "acme-demo-project-payments",
    name: "Payments (acme-demo)",
    slug: "payments-acme-demo",
    environments: [
      { id: "acme-demo-env-dev", name: "Development", slug: "dev" },
      { id: "acme-demo-env-staging", name: "Staging", slug: "staging" },
      { id: "acme-demo-env-prod", name: "Production", slug: "prod" }
    ]
  },
  {
    id: "acme-demo-project-platform",
    name: "Platform (acme-demo)",
    slug: "platform-acme-demo",
    environments: [
      { id: "acme-demo-env-platform-dev", name: "Development", slug: "dev" },
      { id: "acme-demo-env-platform-prod", name: "Production", slug: "prod" }
    ]
  }
];

const DEMO_EXTERNAL_INFISICAL_FOLDER_TREE: TRemoteInfisicalEnvironmentFolderTree = {
  dev: {
    id: "acme-demo-env-dev",
    name: "Development",
    slug: "dev",
    folders: [
      { id: "acme-demo-folder-api", name: "api", path: "/api" },
      { id: "acme-demo-folder-api-v2", name: "v2", path: "/api/v2" },
      { id: "acme-demo-folder-workers", name: "workers", path: "/workers" }
    ]
  },
  staging: {
    id: "acme-demo-env-staging",
    name: "Staging",
    slug: "staging",
    folders: [{ id: "acme-demo-folder-staging-api", name: "api", path: "/api" }]
  },
  prod: {
    id: "acme-demo-env-prod",
    name: "Production",
    slug: "prod",
    folders: [
      { id: "acme-demo-folder-prod-api", name: "api", path: "/api" },
      { id: "acme-demo-folder-prod-jobs", name: "jobs", path: "/jobs" }
    ]
  }
};

const DEMO_CHEF_DATA_BAGS = [{ name: "acme-demo-secrets" }, { name: "acme-demo-config" }];

const DEMO_CHEF_DATA_BAG_ITEMS: Record<string, TChefDataBagItem[]> = {
  "acme-demo-secrets": [{ name: "payments" }, { name: "database" }],
  "acme-demo-config": [{ name: "app" }]
};

export const syncVaultsDemo: SyncVaultsLookups = {
  useOnePassVaults: listOf(DEMO_ONE_PASSWORD_VAULTS),
  useHCVaultMounts: listOf(DEMO_HC_VAULT_MOUNTS),
  useKeeperSharedFolders: listOf(DEMO_KEEPER_SHARED_FOLDERS),
  useExternalInfisicalProjects: listOf(DEMO_EXTERNAL_INFISICAL_PROJECTS),
  useExternalInfisicalFolderTree: (_dto, options) =>
    ready(DEMO_EXTERNAL_INFISICAL_FOLDER_TREE, options?.enabled ?? true),
  useChefDataBags: listOf(DEMO_CHEF_DATA_BAGS),
  useChefDataBagItems: ({ dataBagName }, options) =>
    ready(DEMO_CHEF_DATA_BAG_ITEMS[dataBagName] ?? [], options?.enabled ?? true)
};
