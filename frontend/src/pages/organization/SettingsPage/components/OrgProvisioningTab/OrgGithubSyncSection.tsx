import { useState } from "react";
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
  useUpdateGithubSyncOrgConfig,
  useValidateGithubToken
} from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { GithubOrgSyncConfigModal } from "./GithubOrgSyncConfigModal";

export const OrgGithubSyncSection = () => {
  const { subscription } = useSubscription();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "upgradePlan",
    "githubOrgSyncConfig",
    "deleteGithubOrgSyncConfig",
    "syncAllTeamsToken"
  ] as const);

  const [accessToken, setAccessToken] = useState("");
  const [isValidatingToken, setIsValidatingToken] = useState(false);
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
  const validateGithubTokenMutation = useValidateGithubToken();

  const isPending = subscription.githubOrgSync && githubOrgSyncConfig.isPending;
  const data = !isPending && !githubOrgSyncConfig?.isError ? githubOrgSyncConfig?.data : undefined;

  const handleBulkSync = async (token?: string) => {
    try {
      const result = await syncAllTeamsMutation.mutateAsync({
        githubOrgAccessToken: token
      });
      let message = `Successfully synced teams for ${result.syncedUsersCount} out of ${result.totalUsers} users`;

      const details = [];
      if (result.createdTeams.length > 0) {
        details.push(`${result.createdTeams.length} new teams created`);
      }
      if (result.updatedTeams.length > 0) {
        details.push(`${result.updatedTeams.length} teams updated`);
      }
      if (result.removedMemberships > 0) {
        details.push(`${result.removedMemberships} memberships removed`);
      }
      if (result.skippedUsersCount > 0) {
        details.push(`${result.skippedUsersCount} users skipped`);
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

      setAccessToken("");
      handlePopUpToggle("syncAllTeamsToken", false);
    } catch (error) {
      const errorMessage =
        (error as any)?.response?.data?.message || (error as Error)?.message || "Unknown error";

      if (
        errorMessage.includes("token") &&
        (errorMessage.includes("required") ||
          errorMessage.includes("invalid") ||
          errorMessage.includes("expired"))
      ) {
        handlePopUpOpen("syncAllTeamsToken");
        createNotification({
          text: errorMessage,
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

  const validateToken = async () => {
    if (!accessToken.trim()) {
      createNotification({
        text: "Please enter a GitHub access token",
        type: "error"
      });
      return;
    }

    setIsValidatingToken(true);
    try {
      const result = await validateGithubTokenMutation.mutateAsync({
        githubOrgAccessToken: accessToken.trim()
      });

      setTokenValidationResult(result);

      if (result.valid && result.organizationInfo) {
        createNotification({
          text: `Token validated successfully for organization: ${result.organizationInfo.name}`,
          type: "success"
        });
      }
    } catch (error) {
      const errorMessage =
        (error as any)?.response?.data?.message ||
        (error as Error)?.message ||
        "Token validation failed";
      createNotification({
        text: errorMessage,
        type: "error"
      });
      setTokenValidationResult({ valid: false });
    } finally {
      setIsValidatingToken(false);
    }
  };

  const handleSyncWithToken = async () => {
    if (!accessToken.trim()) {
      createNotification({
        text: "Please enter a GitHub access token",
        type: "error"
      });
      return;
    }

    if (!tokenValidationResult?.valid) {
      await validateToken();
      if (!tokenValidationResult?.valid) {
        return;
      }
    }

    await handleBulkSync(accessToken.trim());
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
            <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.GithubOrgSync}>
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
        isOpen={popUp?.syncAllTeamsToken?.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("syncAllTeamsToken", isOpen);
          if (!isOpen) {
            setAccessToken("");
            setTokenValidationResult(null);
          }
        }}
      >
        <ModalContent
          title="GitHub Access Token Required"
          subTitle="Provide a GitHub access token with organization and team access permissions"
        >
          <div className="space-y-4">
            <FormControl label="GitHub Access Token">
              <div className="space-y-2">
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
                  <div
                    className={`rounded p-2 text-sm ${tokenValidationResult.valid ? "border border-green-800 bg-green-900/20 text-green-400" : "border border-red-800 bg-red-900/20 text-red-400"}`}
                  >
                    {tokenValidationResult.valid && tokenValidationResult.organizationInfo ? (
                      <div>
                        <div className="font-medium">✓ Token Valid</div>
                        <div>
                          Organization: {tokenValidationResult.organizationInfo.name} (
                          {tokenValidationResult.organizationInfo.login})
                        </div>
                        {tokenValidationResult.organizationInfo.publicRepos !== undefined && (
                          <div>
                            Public repos: {tokenValidationResult.organizationInfo.publicRepos}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="font-medium">✗ Token Invalid</div>
                    )}
                  </div>
                )}
              </div>
            </FormControl>
            <p className="text-sm text-mineshaft-400">
              The token needs <code>read:org</code> and <code>read:user</code> permissions to access
              organization teams and members. Once provided and verified, the token will be securely
              stored for future syncs.
            </p>
            <div className="flex justify-between">
              <Button
                colorSchema="secondary"
                variant="outline_bg"
                onClick={validateToken}
                isLoading={isValidatingToken}
                isDisabled={
                  !accessToken.trim() || isValidatingToken || syncAllTeamsMutation.isPending
                }
              >
                Validate Token
              </Button>
              <div className="flex space-x-2">
                <Button
                  colorSchema="secondary"
                  onClick={() => {
                    handlePopUpToggle("syncAllTeamsToken", false);
                    setAccessToken("");
                    setTokenValidationResult(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  colorSchema="primary"
                  onClick={handleSyncWithToken}
                  isLoading={syncAllTeamsMutation.isPending}
                  isDisabled={!accessToken.trim() || syncAllTeamsMutation.isPending}
                >
                  Sync Teams
                </Button>
              </div>
            </div>
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
};
