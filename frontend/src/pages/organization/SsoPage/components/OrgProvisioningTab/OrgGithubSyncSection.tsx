import { useQuery } from "@tanstack/react-query";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, Modal, ModalContent, Skeleton, Spinner, Switch } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useSubscription } from "@app/context";
import { githubOrgSyncConfigQueryKeys, useUpdateGithubSyncOrgConfig } from "@app/hooks/api";
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
    enabled: subscription.githubOrgSync,
    retry: false
  });

  const updateGithubSyncOrgConfig = useUpdateGithubSyncOrgConfig();

  const isPending = subscription.githubOrgSync && githubOrgSyncConfig.isPending;
  const data = !isPending && !githubOrgSyncConfig?.isError ? githubOrgSyncConfig?.data : undefined;

  return (
    <div className="mt-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-6">
      <p className="text-xl font-semibold text-gray-200">
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
                    subscription.githubOrgSync
                      ? handlePopUpOpen("githubOrgSyncConfig")
                      : handlePopUpOpen("upgradePlan")
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
        text="You can use GitHub Organization Plan if you switch to Infisical's Enterprise plan."
      />
    </div>
  );
};
