import type { SyncCloudLookups } from "./contract-sync-cloud";
import { listOf, ready } from "./demo-options";

const DEMO_AZURE_DEVOPS_PROJECTS = [
  { id: "devops-project-payments", name: "acme-demo-payments", appId: "devops-app-payments" },
  { id: "devops-project-platform", name: "acme-demo-platform", appId: "devops-app-platform" }
];

const DEMO_SCIM_SERVICE_PRINCIPALS = [
  { id: "sp-acme-demo-scim", displayName: "Acme Demo SCIM", appId: "app-acme-demo-scim" },
  { id: "sp-acme-labs-scim", displayName: "Acme Labs SCIM", appId: "app-acme-labs-scim" },
  { id: "sp-acme-staging-scim", displayName: "Acme Staging SCIM", appId: "app-acme-staging-scim" }
];

const DEMO_OCI_COMPARTMENTS = [
  { id: "ocid1.compartment.oc1..acmedemoroot", name: "acme-demo-root" },
  { id: "ocid1.compartment.oc1..acmedemopayments", name: "acme-demo-payments" }
];

const DEMO_OCI_VAULTS = [
  { id: "ocid1.vault.oc1.iad.acmedemovaultprimary", displayName: "acme-demo-vault" },
  { id: "ocid1.vault.oc1.iad.acmedemovaultaudit", displayName: "acme-demo-audit-vault" }
];

const DEMO_OCI_KEYS = [
  { id: "ocid1.key.oc1.iad.acmedemokeymaster", displayName: "acme-demo-master-key" },
  { id: "ocid1.key.oc1.iad.acmedemokeysecrets", displayName: "acme-demo-secrets-key" }
];

const DEMO_DIGITAL_OCEAN_APPS = [
  {
    id: "do-app-acme-demo-web",
    spec: { name: "acme-demo-web", services: [{ name: "web" }] }
  },
  {
    id: "do-app-acme-demo-worker",
    spec: { name: "acme-demo-worker", services: [{ name: "worker" }] }
  }
];

const DEMO_CLOUDFLARE_PAGES_PROJECTS = [
  { id: "cf-pages-acme-demo-site", name: "acme-demo-site" },
  { id: "cf-pages-acme-demo-docs", name: "acme-demo-docs" }
];

const DEMO_CLOUDFLARE_WORKERS_SCRIPTS = [{ id: "acme-demo-edge" }, { id: "acme-demo-router" }];

const DEMO_CLOUDFLARE_SECRETS_STORES = [
  { id: "cf-store-acme-demo", name: "acme-demo-store" },
  { id: "cf-store-acme-labs", name: "acme-labs-store" }
];

export const syncCloudDemo: SyncCloudLookups = {
  useAzureDevOpsProjects: listOf(DEMO_AZURE_DEVOPS_PROJECTS),
  useAzureScimServicePrincipals: ({ search }, options) =>
    ready(
      DEMO_SCIM_SERVICE_PRINCIPALS.filter(
        (principal) => !search || principal.displayName.toLowerCase().includes(search.toLowerCase())
      ),
      options?.enabled ?? true
    ),
  useOciCompartments: listOf(DEMO_OCI_COMPARTMENTS),
  useOciVaults: ({ compartmentOcid }, options) =>
    ready(compartmentOcid ? DEMO_OCI_VAULTS : [], options?.enabled ?? true),
  useOciVaultKeys: ({ vaultOcid }, options) =>
    ready(vaultOcid ? DEMO_OCI_KEYS : [], options?.enabled ?? true),
  useDigitalOceanApps: listOf(DEMO_DIGITAL_OCEAN_APPS),
  useCloudflarePagesProjects: listOf(DEMO_CLOUDFLARE_PAGES_PROJECTS),
  useCloudflareWorkersScripts: listOf(DEMO_CLOUDFLARE_WORKERS_SCRIPTS),
  useCloudflareSecretsStores: listOf(DEMO_CLOUDFLARE_SECRETS_STORES)
};
