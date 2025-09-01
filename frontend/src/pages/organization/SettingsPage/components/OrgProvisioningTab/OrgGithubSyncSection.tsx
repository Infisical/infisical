import { useState } from "react";
import { faCircleCheck, faCircleXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Skeleton,
  Spinner,
  Switch
} from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useSubscription } from "@app/context";
import {
  githubOrgSyncConfigQueryKeys,
  useSyncAllGithubTeams,
  useUpdateGithubSyncOrgConfig
} from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { GithubOrgSyncConfigModal } from "./GithubOrgSyncConfigModal";

export const OrgGithubSyncSection = () => {
  const { subscription } = useSubscription();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "upgradePlan",
    "githubOrgSyncConfig",
    "deleteGithubOrgSyncConfig",
    "setAccessToken"
  ] as const);

  const [accessToken, setAccessToken] = useState("");
  const [tokenValidationResult, setTokenValidationResult] = useState<{
    valid: boolean;
    organizationInfo?: {
      id: number;
      login: string;
      name: string;
      publicRepos?: number;
      privateRepos?: number;
    };
  } | null>(null);

  const githubOrgSyncConfig = useQuery({
    ...githubOrgSyncConfigQueryKeys.get(),
    enabled: subscription.githubOrgSync,
    retry: false
  });

  const updateGithubSyncOrgConfig = useUpdateGithubSyncOrgConfig();
  const syncAllTeamsMutation = useSyncAllGithubTeams();

  const isPending = subscription.githubOrgSync && githubOrgSyncConfig.isPending;
  const data = !isPending && !githubOrgSyncConfig?.isError ? githubOrgSyncConfig?.data : undefined;

  const handleBulkSync = async () => {
    try {
      const result = await syncAllTeamsMutation.mutateAsync();
      let message = `Successfully synced teams for ${result.syncedUsersCount} user${result.syncedUsersCount === 1 ? "" : "s"}`;

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
    } catch (error) {
      const errorMessage =
        (error as any)?.response?.data?.message || (error as Error)?.message || "Unknown error";

      if (
        errorMessage.includes("token") &&
        (errorMessage.includes("required") ||
          errorMessage.includes("invalid") ||
          errorMessage.includes("expired") ||
          errorMessage.includes("set a token first"))
      ) {
        handlePopUpOpen("setAccessToken");
        createNotification({
          text: "Please provide a GitHub access token to continue with the sync",
          type: "error"
        });
      } else {
        createNotification({
          text: `Failed to sync GitHub teams: ${errorMessage}`,
          type: "error"
        });
      }
    }
  };

  const handleSetAccessToken = async () => {
    if (!accessToken.trim()) {
      createNotification({
        text: "Please enter a GitHub access token",
        type: "error"
      });
      return;
    }

    try {
      await updateGithubSyncOrgConfig.mutateAsync({
        githubOrgAccessToken: accessToken.trim()
      });

      createNotification({
        text: "GitHub access token set successfully. Starting sync...",
        type: "success"
      });

      setAccessToken("");
      handlePopUpToggle("setAccessToken", false);

      // Automatically trigger sync after token is set
      await handleBulkSync();
    } catch (error) {
      const errorMessage =
        (error as any)?.response?.data?.message || (error as Error)?.message || "Unknown error";

      createNotification({
        text: `Failed to set GitHub access token: ${errorMessage}`,
        type: "error"
      });
    }
  };

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
        text="You can use GitHub Organization Plan if you switch to Infisical's Enterprise plan."
      />
      <Modal
        isOpen={popUp?.setAccessToken?.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("setAccessToken", isOpen);
          if (!isOpen) {
            setAccessToken("");
            setTokenValidationResult(null);
          }
        }}
      >
        <ModalContent
          title="GitHub Access Token Required"
          subTitle="Provide a GitHub access token to sync teams from your GitHub organization"
        >
          <div className="space-y-4">
            <FormControl
              label="GitHub Access Token"
              tooltipText="The provided token must be granted read:org and read:user permissions in order to successfully sync groups"
              tooltipClassName="max-w-md"
            >
              <div className="relative">
                <Input
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxx"
                  value={accessToken}
                  onChange={(e) => {
                    setAccessToken(e.target.value);
                    if (tokenValidationResult) {
                      setTokenValidationResult(null);
                    }
                  }}
                  autoComplete="off"
                />
                {tokenValidationResult && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {tokenValidationResult.valid ? (
                      <FontAwesomeIcon icon={faCircleCheck} size="xs" className="text-green-500" />
                    ) : (
                      <FontAwesomeIcon icon={faCircleXmark} size="xs" className="text-red-500" />
                    )}
                  </div>
                )}
              </div>
            </FormControl>
            <div className="flex justify-between">
              <div className="flex space-x-2">
                <Button
                  colorSchema="secondary"
                  onClick={() => {
                    handlePopUpToggle("setAccessToken", false);
                    setAccessToken("");
                    setTokenValidationResult(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  colorSchema="primary"
                  onClick={handleSetAccessToken}
                  isLoading={updateGithubSyncOrgConfig.isPending || syncAllTeamsMutation.isPending}
                  isDisabled={
                    !accessToken.trim() ||
                    updateGithubSyncOrgConfig.isPending ||
                    syncAllTeamsMutation.isPending
                  }
                >
                  Set Token & Sync
                </Button>
              </div>
            </div>
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
};
