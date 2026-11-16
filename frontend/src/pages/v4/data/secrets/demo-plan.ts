import { useRouterState } from "@tanstack/react-router";

import { SecretSync } from "@app/hooks/api/secretSyncs/enums";

import type { OverviewPlan, SecretsPlanAdapter } from "./contract-plan";
import { useScenario, useStore } from "./demo-store";

const FREE: OverviewPlan = {
  environmentLimit: 3,
  dynamicSecret: false,
  secretRotation: false,
  honeyTokens: false,
  pitRecovery: false,
  secretsFolderRbac: false,
  secretAccessInsights: false,
  secretApproval: false,
  enterpriseSecretSyncs: false
};

const PAID: OverviewPlan = {
  environmentLimit: 0,
  dynamicSecret: true,
  secretRotation: true,
  honeyTokens: true,
  pitRecovery: true,
  secretsFolderRbac: true,
  secretAccessInsights: true,
  secretApproval: true,
  enterpriseSecretSyncs: false
};

const AT_LIMIT: OverviewPlan = { ...PAID, environmentLimit: 3 };

const HONEY_TOKEN_LIMIT = 25;

const usePlanOverride = () =>
  useRouterState({
    select: (state) => new URLSearchParams(state.location.searchStr).get("plan")
  });

export const secretsPlanDemo: SecretsPlanAdapter = {
  useOverviewPlan: () => {
    const scenario = useScenario();
    const override = usePlanOverride();
    let plan = PAID;
    if (override === "free" || scenario === "empty") plan = FREE;
    else if (scenario === "large") plan = AT_LIMIT;
    return { data: plan, isPending: false, error: null };
  },
  useHoneyTokenLimit: () => {
    const scenario = useScenario();
    const used = useStore().use().honeyTokens.length;
    return async () => ({
      used: scenario === "large" ? Math.max(used, HONEY_TOKEN_LIMIT) : used,
      limit: HONEY_TOKEN_LIMIT
    });
  },
  useSecretSyncOptions: () => ({
    data: (Object.values(SecretSync) as SecretSync[]).map((destination) => ({
      name: destination,
      destination,
      canImportSecrets: false,
      enterprise: destination === SecretSync.OCIVault || destination === SecretSync.Chef
    })),
    isPending: false,
    error: null
  })
};
