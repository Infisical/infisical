import { useQuery } from "@tanstack/react-query";
import { GitBranch } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Detail,
  DetailLabel,
  DetailValue,
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldTitle,
  Skeleton,
  Switch
} from "@app/components/v3";
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
    "deleteGithubOrgSyncConfig"
  ] as const);

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
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            <GitBranch className="size-4 text-accent" />
            GitHub Organization Sync
          </CardTitle>
          <CardDescription>Sync user groups from your GitHub organization teams.</CardDescription>
          <CardAction>
            <OrgPermissionCan I={OrgPermissionActions.Read} a={OrgPermissionSubjects.GithubOrgSync}>
              {(isAllowed) => (
                <Button
                  variant="outline"
                  isDisabled={!isAllowed}
                  isPending={isPending}
                  onClick={() =>
                    subscription.githubOrgSync
                      ? handlePopUpOpen("githubOrgSyncConfig")
                      : handlePopUpOpen("upgradePlan", {
                          isEnterpriseFeature: true
                        })
                  }
                >
                  Configure
                </Button>
              )}
            </OrgPermissionCan>
          </CardAction>
        </CardHeader>
        {(isPending || data) && (
          <CardContent>
            <FieldGroup>
              <Detail>
                <DetailLabel>GitHub Organization</DetailLabel>
                <DetailValue>
                  {isPending ? <Skeleton className="h-5 w-40" /> : data?.githubOrgName}
                </DetailValue>
              </Detail>
              {data && (
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldTitle>Enable GitHub Sync</FieldTitle>
                    <FieldDescription>
                      Allow group provisioning/deprovisioning with GitHub.
                    </FieldDescription>
                  </FieldContent>
                  <OrgPermissionCan
                    I={OrgPermissionActions.Edit}
                    a={OrgPermissionSubjects.GithubOrgSync}
                  >
                    {(isAllowed) => (
                      <Switch
                        id="enable-sync"
                        variant="org"
                        checked={data.isActive}
                        onCheckedChange={(value) =>
                          updateGithubSyncOrgConfig.mutate({
                            isActive: value
                          })
                        }
                        disabled={!isAllowed || updateGithubSyncOrgConfig.isPending}
                      />
                    )}
                  </OrgPermissionCan>
                </Field>
              )}
              {data && data.isActive && (
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldTitle>Sync Now</FieldTitle>
                    <FieldDescription>
                      Manually sync GitHub teams for all organization members. This will update team
                      memberships for users who have previously logged in with GitHub.
                    </FieldDescription>
                  </FieldContent>
                  <OrgPermissionCan
                    I={OrgPermissionActions.Edit}
                    a={OrgPermissionSubjects.GithubOrgSyncManual}
                  >
                    {(isAllowed) => (
                      <Button
                        variant="outline"
                        isDisabled={!isAllowed || syncAllTeamsMutation.isPending}
                        isPending={syncAllTeamsMutation.isPending}
                        onClick={() => handleBulkSync()}
                      >
                        Sync Now
                      </Button>
                    )}
                  </OrgPermissionCan>
                </Field>
              )}
            </FieldGroup>
          </CardContent>
        )}
      </Card>
      <GithubOrgSyncConfigModal
        data={data}
        popUp={popUp}
        handlePopUpOpen={handlePopUpOpen}
        handlePopUpToggle={handlePopUpToggle}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="Your current plan does not include access to GitHub Organization Sync. To unlock this feature, please upgrade to Infisical Enterprise plan."
        isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
      />
    </>
  );
};
