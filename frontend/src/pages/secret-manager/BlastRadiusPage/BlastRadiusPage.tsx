import { Helmet } from "react-helmet";
import { useParams, useSearch } from "@tanstack/react-router";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionSub, useSubscription } from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { withProjectPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks/usePopUp";

import { BlastRadiusPanel } from "./components/BlastRadiusPanel";

/**
 * Standalone route for a shared link. The drawer opened from the secrets list is the primary entry
 * point; both render the same panel so the two never drift.
 */
export const BlastRadiusPage = withProjectPermission(
  () => {
    const { projectId, orgId } = useParams({
      from: ROUTE_PATHS.SecretManager.BlastRadiusPage.id
    });
    const search = useSearch({ from: ROUTE_PATHS.SecretManager.BlastRadiusPage.id });
    const { subscription } = useSubscription();
    const { popUp, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);

    if (!subscription?.secretAccessInsights) {
      return (
        <UpgradePlanModal
          isOpen
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text="Blast radius can be unlocked if you upgrade to Infisical Pro."
        />
      );
    }

    return (
      <div className="flex h-full min-h-0 flex-col p-4">
        <Helmet>
          <title>{`Blast Radius · ${search.secretKey}`}</title>
        </Helmet>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-card">
          <BlastRadiusPanel
            projectId={projectId}
            orgId={orgId}
            secretKey={search.secretKey}
            environment={search.environment}
            secretPath={search.secretPath}
          />
        </div>
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text="Blast radius can be unlocked if you upgrade to Infisical Pro."
        />
      </div>
    );
  },
  {
    action: ProjectPermissionSecretActions.DescribeSecret,
    subject: ProjectPermissionSub.Secrets
  }
);
