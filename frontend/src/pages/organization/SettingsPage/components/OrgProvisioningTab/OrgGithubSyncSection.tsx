import { useQuery } from "@tanstack/react-query";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, Modal, ModalContent, Skeleton, Spinner, Switch } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useSubscription } from "@app/context";
import {
  githubOrgSyncConfigQueryKeys,
  useSyncAllGithubTeams,
  useUpdateGithubSyncOrgConfig
} from "@app/hooks/api";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { GithubOrgSyncConfigModal } from "./GithubOrgSyncConfigModal";

export const OrgGithubSyncSection = () => {
  const { subscription } = useSubscription();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "upgradePlan",
    "githubOrgSyncConfig",
    "deleteGithubOrgSyncConfig"
  ] as const);

  const githubOrgSyncConfig = useQuery({
    ...githubOrgSyncConfigQueryKeys.get(),
    enabled: subscription.get(SubscriptionProductCategory.Platform, "githubOrgSync"),
    retry: false
  });

  const updateGithubSyncOrgConfig = useUpdateGithubSyncOrgConfig();
  const syncAllTeamsMutation = useSyncAllGithubTeams();

  const isPending =
    subscription.get(SubscriptionProductCategory.Platform, "githubOrgSync") &&
    githubOrgSyncConfig.isPending;
  const data = !isPending && !githubOrgSyncConfig?.isError ? githubOrgSyncConfig?.data : undefined;

  const handleBulkSync = async () => {
    const result = await syncAllTeamsMutation.mutateAsync();
    let message = "Successfully synced teams";

    const details = [];
    if (result.createdTeams.length > 0) {
      details.push(
        `${result.createdTeams.length} new team${result.createdTeams.length === 1 ? "" : "s"} created`
      );
    }
    if (result.updatedTeams.length > 0) {
      details.push(
        `${result.updatedTeams.length} team${result.updatedTeams.length === 1 ? "" : "s"} updated`
      );
    }
    if (result.removedMemberships > 0) {
      details.push(
        `${result.removedMemberships} membership${result.removedMemberships === 1 ? "" : "s"} removed`
      );
    }

    if (details.length > 0) {
      message += `. ${details.join(", ")}`;
    }

    createNotification({
      text: message,
      type: "success"
    });

    if (result.errors && result.errors.length > 0) {
      createNotification({
        text: `Sync completed with ${result.errors.length} warnings. Check the console for details.`,
        type: "warning"
      });
      console.warn("Sync errors:", result.errors);
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-6">
      <p className="text-xl font-medium text-gray-200">
        Sync user groups from your GitHub Organization
      </p>
      <div className="py-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-md text-mineshaft-100">GitHub Organization</h2>
          <div className="flex gap-4">
            <OrgPermissionCan I={OrgPermissionActions.Read} a={OrgPermissionSubjects.GithubOrgSync}>
              {(isAllowed) => (
                <Button
                  onClick={() =>
                    subscription.get(SubscriptionProductCategory.Platform, "githubOrgSync")
                      ? handlePopUpOpen("githubOrgSyncConfig")
                      : handlePopUpOpen("upgradePlan", {
                          isEnterpriseFeature: true
                        })
                  }
                  colorSchema="secondary"
                  isDisabled={!isAllowed}
                  isLoading={isPending}
                >
                  Configure
                </Button>
              )}
            </OrgPermissionCan>
          </div>
        </div>
        <p className="text-sm text-mineshaft-300">
          {isPending ? <Skeleton /> : null}
          {data ? data?.githubOrgName : "Not configured"}
        </p>
      </div>
      {data && (
        <div className="py-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-md text-mineshaft-100">Enable GitHub Sync</h2>
            <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.GithubOrgSync}>
              {(isAllowed) => (
                <Switch
                  id="enable-sync"
                  onCheckedChange={(value) =>
                    updateGithubSyncOrgConfig.mutate({
                      isActive: value
                    })
                  }
                  isChecked={githubOrgSyncConfig?.data?.isActive ?? false}
                  isDisabled={!isAllowed}
                >
                  {updateGithubSyncOrgConfig?.isPending && <Spinner size="xs" />}
                </Switch>
              )}
            </OrgPermissionCan>
          </div>
          <p className="text-sm text-mineshaft-300">
            Allow group provisioning/deprovisioning with GitHub
          </p>
        </div>
      )}
      {data && data.isActive && (
        <div className="py-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-md text-mineshaft-100">Sync Now</h2>
            <OrgPermissionCan
              I={OrgPermissionActions.Edit}
              a={OrgPermissionSubjects.GithubOrgSyncManual}
            >
              {(isAllowed) => (
                <Button
                  onClick={() => handleBulkSync()}
                  colorSchema="primary"
                  variant="outline_bg"
                  isDisabled={!isAllowed || syncAllTeamsMutation.isPending}
                  isLoading={syncAllTeamsMutation.isPending}
                >
                  Sync Now
                </Button>
              )}
            </OrgPermissionCan>
          </div>
          <p className="text-sm text-mineshaft-300">
            Manually sync GitHub teams for all organization members. This will update team
            memberships for users who have previously logged in with GitHub.
          </p>
        </div>
      )}
      <Modal
        isOpen={popUp?.githubOrgSyncConfig?.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("githubOrgSyncConfig", isOpen);
        }}
      >
        <ModalContent
          title="Manage GitHub Organization Sync"
          subTitle="Sync your GitHub teams to Infisical organization groups"
        >
          <GithubOrgSyncConfigModal
            data={data}
            popUp={popUp}
            handlePopUpOpen={handlePopUpOpen}
            handlePopUpToggle={handlePopUpToggle}
          />
        </ModalContent>
      </Modal>
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="Your current plan does not include access to GitHub Organization Sync. To unlock this feature, please upgrade to Infisical Enterprise plan."
        isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
      />
    </div>
  );
};
