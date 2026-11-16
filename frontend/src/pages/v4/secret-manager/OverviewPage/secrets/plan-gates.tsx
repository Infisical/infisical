import { createContext, type ReactNode, use, useCallback, useMemo } from "react";

import { hasEnvironmentCapacity } from "@app/components/license/UpgradeGate/environment-limit";
import {
  DynamicSecretsUpgradeIntent,
  EnterpriseSecretSyncsUpgradeIntent,
  EnvironmentLimitUpgradeIntent,
  FolderAccessControlsUpgradeIntent,
  HoneyTokensUpgradeIntent,
  PointInTimeRecoveryUpgradeIntent,
  SecretAccessInsightsUpgradeIntent,
  SecretImportReplicationUpgradeIntent,
  SecretRotationsUpgradeIntent,
  type UpgradeIntent
} from "@app/components/license/UpgradeGate/upgrade-intents";

import { failed } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import type { OverviewPlan } from "../../../data/secrets/contract-plan";
import { useV4Session } from "../../../data/session/contract";
import { useUpgradeGate } from "../../../license";

export type PlanGate =
  | "environment"
  | "dynamic"
  | "rotation"
  | "honey"
  | "commits"
  | "folderAccess"
  | "accessInsights"
  | "replication"
  | "enterpriseSync";

const PAYWALL_KEY = "secret-manager.overview";

const GATES: Record<PlanGate, { intent: UpgradeIntent; feature: keyof OverviewPlan }> = {
  environment: { intent: EnvironmentLimitUpgradeIntent, feature: "environmentLimit" },
  dynamic: { intent: DynamicSecretsUpgradeIntent, feature: "dynamicSecret" },
  rotation: { intent: SecretRotationsUpgradeIntent, feature: "secretRotation" },
  honey: { intent: HoneyTokensUpgradeIntent, feature: "honeyTokens" },
  commits: { intent: PointInTimeRecoveryUpgradeIntent, feature: "pitRecovery" },
  folderAccess: { intent: FolderAccessControlsUpgradeIntent, feature: "secretsFolderRbac" },
  accessInsights: { intent: SecretAccessInsightsUpgradeIntent, feature: "secretAccessInsights" },
  replication: { intent: SecretImportReplicationUpgradeIntent, feature: "secretApproval" },
  enterpriseSync: { intent: EnterpriseSecretSyncsUpgradeIntent, feature: "enterpriseSecretSyncs" }
};

type PlanGates = {
  plan?: OverviewPlan;
  guard: (gate: PlanGate, run: () => void) => void;
};

const PlanGateContext = createContext<PlanGates>({ guard: (_gate, run) => run() });

export const usePlanGates = () => use(PlanGateContext);

export const usePlanGateHost = (projectId: string, environmentCount: number) => {
  const { organization } = useV4Session();
  const adapter = useV4Adapter("secrets");
  const plan = adapter.useOverviewPlan(organization.id).data;
  const honeyTokenLimit = adapter.useHoneyTokenLimit();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();

  const guard = useCallback(
    (gate: PlanGate, run: () => void) => {
      if (!plan) {
        run();
        return;
      }
      const { intent, feature } = GATES[gate];
      const isAllowed =
        gate === "environment"
          ? hasEnvironmentCapacity(plan.environmentLimit, environmentCount)
          : Boolean(plan[feature]);
      if (!isAllowed) {
        openUpgradeGate({ intent, paywallKey: PAYWALL_KEY });
        return;
      }
      if (gate !== "honey") {
        run();
        return;
      }
      honeyTokenLimit(projectId).then(
        ({ used, limit }) => {
          if (limit === null || used < limit) {
            run();
            return;
          }
          openUpgradeGate({
            intent: {
              ...HoneyTokensUpgradeIntent,
              upgradeLabel: "Increase Honey Token Limit",
              quota: { used, limit },
              quotaNotice: `You have used ${used} out of the ${limit} honey token limit.`
            },
            paywallKey: PAYWALL_KEY
          });
        },
        (error: unknown) => failed("Failed to check honey token limits. Please try again.", error)
      );
    },
    [plan, environmentCount, honeyTokenLimit, projectId, openUpgradeGate]
  );

  const gates = useMemo(() => ({ plan, guard }), [plan, guard]);
  const provider = (children: ReactNode) => (
    <PlanGateContext value={gates}>
      {children}
      {upgradeGate}
    </PlanGateContext>
  );

  return { ...gates, provider };
};
