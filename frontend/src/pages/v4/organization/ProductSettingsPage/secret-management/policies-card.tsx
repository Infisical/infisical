import { useMemo, useState } from "react";
import { Alert, AlertDescription } from "@infisical/cipher/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Stack } from "@infisical/cipher/ui/layout";
import { SettingsCard, useAutosave } from "@infisical/cipher/ui/settings-card";
import { Switch } from "@infisical/cipher/ui/switch";

import { CrossProjectSecretSharingUpgradeIntent } from "@app/components/license/UpgradeGate/upgrade-intents";
import type { Organization } from "@app/hooks/api/organization/types";

import { saved } from "../../../access/toast";
import { RESTRICTED } from "../../../access/ui";
import { useV4Adapter } from "../../../data/adapters";
import { useUpgradeGate } from "../../../license";

type Policies = { blockDuplicates: boolean; crossProjectSharing: boolean };

export const PoliciesCard = ({
  organization,
  canEdit,
  crossProjectSharingLicensed
}: {
  organization: Organization;
  canEdit: boolean;
  crossProjectSharingLicensed: boolean;
}) => {
  const updateOrganization = useV4Adapter("org").useUpdateOrganization();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const [confirmingDisable, setConfirmingDisable] = useState(false);
  const blockDuplicates = organization.blockDuplicateSecretSyncDestinations ?? false;
  const crossProjectSharing = organization.allowCrossProjectSecretSharing ?? false;
  const stored = useMemo(
    () => ({ blockDuplicates, crossProjectSharing }),
    [blockDuplicates, crossProjectSharing]
  );
  const { value, save, status, pending } = useAutosave<Policies>({
    value: stored,
    errorMessage: "Couldn't update secrets management policies. Try again.",
    onSave: async (next) => {
      await updateOrganization.mutateAsync({
        orgId: organization.id,
        blockDuplicateSecretSyncDestinations: next.blockDuplicates,
        allowCrossProjectSecretSharing: next.crossProjectSharing
      });
      if (next.blockDuplicates !== stored.blockDuplicates)
        saved(
          next.blockDuplicates
            ? "Duplicate secret sync destinations are now blocked"
            : "Duplicate secret sync destinations are now allowed"
        );
      else
        saved(
          next.crossProjectSharing
            ? "Cross-project secret sharing enabled"
            : "Cross-project secret sharing disabled"
        );
    }
  });
  const disabledReason = canEdit ? undefined : RESTRICTED;

  return (
    <>
      <SettingsCard title="Policies" saveStatus={status}>
        <Stack gap={16}>
          <Switch
            layout="row"
            label="Unique secret sync destinations"
            description="Each destination can be used by only one secret sync, so syncs can't overwrite each other."
            checked={value.blockDuplicates}
            disabled={pending}
            disabledReason={disabledReason}
            onCheckedChange={(checked) => save({ ...value, blockDuplicates: checked })}
          />
          <Switch
            layout="row"
            label="Cross-project secret sharing"
            description="Secret imports and references can point at folders and secrets in other projects of this organization."
            checked={value.crossProjectSharing}
            disabled={pending}
            disabledReason={disabledReason}
            onCheckedChange={(checked) => {
              if (!checked) {
                setConfirmingDisable(true);
                return;
              }
              if (!crossProjectSharingLicensed) {
                openUpgradeGate({
                  intent: CrossProjectSecretSharingUpgradeIntent,
                  paywallKey: "organization.product-settings"
                });
                return;
              }
              save({ ...value, crossProjectSharing: true });
            }}
          />
        </Stack>
      </SettingsCard>
      <AlertDialog open={confirmingDisable} onOpenChange={setConfirmingDisable}>
        <AlertDialogContent tone="danger">
          <AlertDialogHeader>
            <AlertDialogTitle>Disable cross-project secret sharing?</AlertDialogTitle>
            <AlertDialogDescription>
              Projects in this organization will no longer be able to share secrets with each other.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Alert tone="warn">
            <AlertDescription>
              Secret imports and references that point to other projects stop resolving, which can
              break secret syncs and integrations that depend on them.
            </AlertDescription>
          </Alert>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => save({ ...value, crossProjectSharing: false })}
            >
              Disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {upgradeGate}
    </>
  );
};
