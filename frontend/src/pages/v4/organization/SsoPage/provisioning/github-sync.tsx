import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { GithubSyncUpgradeIntent } from "@app/components/license/UpgradeGate/capability-upgrade-intents";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import { Detail, DetailLabel, DetailValue } from "@app/components/v4/ui/detail";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { Skeleton } from "@app/components/v4/ui/skeleton";
import { toast as v4Toast } from "@app/components/v4/ui/sonner";
import { Switch } from "@app/components/v4/ui/switch";
import { SmallText, Text } from "@app/components/v4/ui/text";
import {
  OrgPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import type { TGithubOrgSyncConfig } from "@app/hooks/api/githubOrgSyncConfig/types";

import { useOrgId, useOrgPermission } from "../../../access/permissions";
import { failed, saved } from "../../../access/toast";
import { Gate } from "../../../access/ui";
import { useV4Adapter } from "../../../data/adapters";
import { useUpgradeGate } from "../../../license";

const schema = z.object({
  githubOrgName: z.string(),
  githubOrgAccessToken: z.string().optional()
});

type FormData = z.infer<typeof schema>;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

const GithubOrgSyncConfigDialog = ({
  data,
  open,
  onOpenChange
}: {
  data?: TGithubOrgSyncConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const sso = useV4Adapter("sso");
  const createConfig = sso.useCreateGithubOrgSyncConfig();
  const updateConfig = sso.useUpdateGithubOrgSyncConfig();
  const deleteConfig = sso.useDeleteGithubOrgSyncConfig();
  const [deleting, setDeleting] = useState(false);
  const isUpdate = Boolean(data);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    values: data ? { githubOrgName: data.githubOrgName, githubOrgAccessToken: "" } : undefined
  });

  const onSubmit = async ({ githubOrgName, githubOrgAccessToken }: FormData) => {
    try {
      if (isUpdate) {
        await updateConfig.mutateAsync({ githubOrgName, githubOrgAccessToken });
        saved("GitHub organization sync updated");
      } else {
        await createConfig.mutateAsync({ githubOrgName, githubOrgAccessToken, isActive: false });
        saved("GitHub organization sync created");
      }
      onOpenChange(false);
    } catch (error) {
      failed(`Failed to ${isUpdate ? "update" : "create"} GitHub organization sync`, error);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent pending={isSubmitting}>
          <form onSubmit={handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>Manage GitHub organization sync</DialogTitle>
              <DialogDescription>Sync your GitHub teams to Infisical groups.</DialogDescription>
            </DialogHeader>
            <Stack gap={16}>
              <Controller
                control={control}
                defaultValue=""
                name="githubOrgName"
                render={({ field, fieldState: { error } }) => (
                  <Field label="GitHub organization name" error={error?.message}>
                    <Input placeholder="example" invalid={Boolean(error)} {...field} />
                  </Field>
                )}
              />
              <Controller
                control={control}
                defaultValue=""
                name="githubOrgAccessToken"
                render={({ field, fieldState: { error } }) => (
                  <Field
                    label="GitHub access token"
                    optional
                    description="Required for manual sync. The token needs the read:org scope."
                    error={error?.message}
                  >
                    <Input
                      type="password"
                      mono
                      autoComplete="off"
                      placeholder="ghp_xxxxxxxxxxxx"
                      invalid={Boolean(error)}
                      {...field}
                    />
                  </Field>
                )}
              />
            </Stack>
            <DialogFooter>
              {isUpdate && (
                <Button
                  type="button"
                  variant="destructive"
                  className="mr-auto"
                  onClick={() => setDeleting(true)}
                >
                  Delete
                </Button>
              )}
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" loading={isSubmitting}>
                {isUpdate ? "Update" : "Configure"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent tone="danger" pending={deleteConfig.isPending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete GitHub organization sync?</AlertDialogTitle>
            <AlertDialogDescription>
              Organization members will no longer have their groups synced from GitHub teams.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                loading={deleteConfig.isPending}
                onClick={async (event) => {
                  event.preventDefault();
                  try {
                    await deleteConfig.mutateAsync();
                    setDeleting(false);
                    onOpenChange(false);
                    saved("GitHub organization sync deleted");
                  } catch (error) {
                    failed("Failed to remove GitHub organization sync", error);
                  }
                }}
              >
                Delete
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export const GithubOrgSync = () => {
  const orgId = useOrgId();
  const sso = useV4Adapter("sso");
  const { permission } = useOrgPermission();
  const { data: entitlements, isPending: isSubscriptionPending } = sso.useSubscription(orgId);
  const isEntitled = Boolean(entitlements?.githubOrgSync);
  const config = sso.useGithubOrgSyncConfig({ enabled: isEntitled });
  const updateConfig = sso.useUpdateGithubOrgSyncConfig();
  const syncAllTeams = sso.useSyncAllGithubTeams();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const [configuring, setConfiguring] = useState(false);

  const isPending = isEntitled && config.isPending;
  const data = !isPending && !config.error ? config.data : undefined;
  const canRead = permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.GithubOrgSync);
  const canEdit = permission.can(OrgPermissionActions.Edit, OrgPermissionSubjects.GithubOrgSync);
  const canSync = permission.can(
    OrgPermissionActions.Edit,
    OrgPermissionSubjects.GithubOrgSyncManual
  );

  const handleBulkSync = async () => {
    let result;
    try {
      result = await syncAllTeams.mutateAsync();
    } catch (error) {
      failed("Failed to sync GitHub teams", error);
      return;
    }
    const details = [];
    if (result.createdTeams.length > 0) {
      details.push(`${plural(result.createdTeams.length, "new team")} created`);
    }
    if (result.updatedTeams.length > 0) {
      details.push(`${plural(result.updatedTeams.length, "team")} updated`);
    }
    if (result.removedMemberships > 0) {
      details.push(`${plural(result.removedMemberships, "membership")} removed`);
    }
    const summary = details.length > 0 ? `${details.join(", ")}.` : undefined;
    if (result.errors && result.errors.length > 0) {
      v4Toast.warning("GitHub team sync completed with warnings", {
        description: [summary, result.errors.join(" ")].filter(Boolean).join(" ")
      });
      return;
    }
    v4Toast.success("GitHub teams synced", { description: summary });
  };

  return (
    <>
      <Card
        variant="framed"
        title="GitHub organization sync"
        description="Sync user groups from your GitHub organization teams."
        action={
          <Button
            variant="outline"
            size="xs"
            loading={isPending || isSubscriptionPending}
            disabledReason={
              canRead ? undefined : "You need permission to read GitHub organization sync."
            }
            onClick={() =>
              isEntitled
                ? setConfiguring(true)
                : openUpgradeGate({
                    intent: { ...GithubSyncUpgradeIntent, isEnterpriseFeature: true },
                    paywallKey: "organization.org-github-sync"
                  })
            }
          >
            Configure
          </Button>
        }
      >
        {isPending || data ? (
          <Stack gap={16}>
            <Detail>
              <DetailLabel>GitHub organization</DetailLabel>
              <DetailValue>
                {isPending ? <Skeleton className="h-5 w-40" /> : data?.githubOrgName}
              </DetailValue>
            </Detail>
            {data && (
              <Gate
                allowed={canEdit}
                reason="You need permission to edit GitHub organization sync."
              >
                <Switch
                  layout="row"
                  label="Enable GitHub sync"
                  description="Provision and deprovision groups from GitHub teams."
                  checked={Boolean(data.isActive)}
                  disabled={!canEdit || updateConfig.isPending}
                  onChange={async (isActive) => {
                    try {
                      await updateConfig.mutateAsync({ isActive });
                      saved(`GitHub sync ${isActive ? "enabled" : "disabled"}`);
                    } catch (error) {
                      failed(`Failed to ${isActive ? "enable" : "disable"} GitHub sync`, error);
                    }
                  }}
                />
              </Gate>
            )}
            {data?.isActive && (
              <Inline gap={16} align="center" justify="between">
                <Stack gap={4}>
                  <Text>Sync now</Text>
                  <SmallText muted>
                    Updates team memberships for members who have signed in with GitHub before.
                  </SmallText>
                </Stack>
                <Button
                  variant="outline"
                  size="sm"
                  icon="sync"
                  loading={syncAllTeams.isPending}
                  disabledReason={
                    canSync ? undefined : "You need permission to run a manual GitHub sync."
                  }
                  onClick={handleBulkSync}
                >
                  Sync now
                </Button>
              </Inline>
            )}
          </Stack>
        ) : (
          <SmallText muted>Not configured</SmallText>
        )}
      </Card>
      <GithubOrgSyncConfigDialog data={data} open={configuring} onOpenChange={setConfiguring} />
      {upgradeGate}
    </>
  );
};
