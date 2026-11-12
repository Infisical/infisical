import type { SyncAutomationLookups } from "./contract-sync-automation";
import { listOf, ready } from "./demo-options";

const TRIGGER_ORGS = [
  { id: "org_demo_acme", name: "Acme demo", slug: "acme-demo" },
  { id: "org_demo_labs", name: "Acme labs demo", slug: "acme-labs-demo" }
];

export const syncAutomationDemo: SyncAutomationLookups = {
  useRundeckProjects: listOf([{ name: "payments-demo" }, { name: "ledger-demo" }]),
  useWindmillWorkspaces: listOf([
    { id: "acme-demo", name: "acme-demo" },
    { id: "acme-staging-demo", name: "acme-staging-demo" }
  ]),
  useChecklyAccounts: listOf([
    { id: "demo-account-1", name: "Acme demo", runtimeId: "2024.02" },
    { id: "demo-account-2", name: "Acme labs demo", runtimeId: "2024.02" }
  ]),
  useChecklyGroups: (_dto, options) =>
    ready(
      [
        { id: "101", name: "Checkout checks (demo)", runtimeId: "2024.02" },
        { id: "102", name: "API health (demo)", runtimeId: "2024.02" }
      ],
      options?.enabled ?? true
    ),
  useOnaProjects: listOf([
    { id: "demo-ona-payments", name: "payments-demo" },
    { id: "demo-ona-web", name: "web-demo" }
  ]),
  useTriggerDevProjects: listOf([
    { id: "proj_demo_payments", name: "payments-jobs", organization: TRIGGER_ORGS[0] },
    { id: "proj_demo_emails", name: "email-jobs", organization: TRIGGER_ORGS[0] },
    { id: "proj_demo_research", name: "research-jobs", organization: TRIGGER_ORGS[1] }
  ]),
  useTriggerDevEnvironments: (_dto, options) =>
    ready(
      [
        { id: "env_demo_dev", slug: "dev", type: "DEVELOPMENT" },
        { id: "env_demo_stg", slug: "staging", type: "STAGING" },
        { id: "env_demo_prod", slug: "prod", type: "PRODUCTION" }
      ],
      options?.enabled ?? true
    )
};
