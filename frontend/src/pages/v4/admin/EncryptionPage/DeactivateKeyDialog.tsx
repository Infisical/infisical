import { useState } from "react";

import { Alert } from "@app/components/v4/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import { Checkbox } from "@app/components/v4/ui/checkbox";
import { Stack } from "@app/components/v4/ui/layout";
import type { TEncryptionRootKey } from "@app/hooks/api/admin/types";

import { saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";

type Expiring = NonNullable<TEncryptionRootKey["expiring"]>;

export const DeactivateKeyDialog = ({
  expiring,
  open,
  onOpenChange
}: {
  expiring: Expiring;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const admin = useV4Adapter("admin");
  const deleteExpiringKey = admin.useDeleteExpiringEncryptionKey();
  const [acknowledged, setAcknowledged] = useState(false);
  const [overrideStraggler, setOverrideStraggler] = useState(false);
  const [pending, setPending] = useState(false);
  const straggler = Boolean(expiring.lastResolvedAt);

  const close = (next: boolean) => {
    if (!next) {
      setAcknowledged(false);
      setOverrideStraggler(false);
    }
    onOpenChange(next);
  };

  let blocked: string | undefined;
  if (!expiring.label) blocked = "This key has no label to deactivate";
  else if (straggler && !overrideStraggler)
    blocked = "Confirm that no instance is still running on this key";
  else if (!acknowledged) blocked = "Confirm that you archived the old key";

  const deactivate = async () => {
    if (!expiring.label) return;
    setPending(true);
    try {
      await deleteExpiringKey.mutateAsync({ label: expiring.label, force: overrideStraggler });
    } catch {
      setPending(false);
      return;
    }
    setPending(false);
    close(false);
    saved("Previous encryption key deactivated.");
  };

  return (
    <AlertDialog open={open} onOpenChange={close}>
      <AlertDialogContent tone="danger" icon="lock" pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>Deactivate the previous key</AlertDialogTitle>
          <AlertDialogDescription>
            {`The key ${expiring.label ?? "from your last rotation"} stops opening this database. It stays in the key history so you can tell which archived key a restored backup needs.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Stack gap={16}>
          {straggler ? (
            <Alert tone="warn" title="An instance may still be running on this key">
              {`One last started on it ${new Date(expiring.lastResolvedAt!).toLocaleString()}. That is the last time the key was used. Check your fleet before continuing: any instance that hasn't restarted onto the new key will fail to start.`}
            </Alert>
          ) : (
            <Alert tone="ok" title="No instance is running on this key">
              Nothing has started on it since the rotation. Instances that have not restarted yet
              will not have reported.
            </Alert>
          )}
          {straggler && (
            <Checkbox
              checked={overrideStraggler}
              onChange={setOverrideStraggler}
              label="I have verified that no Infisical instance is still running with the old key, and I understand that any instance that has not been given the new key will fail its next restart."
            />
          )}
          <Checkbox
            checked={acknowledged}
            onChange={setAcknowledged}
            label="I have archived the old key somewhere I can recover it. Database backups taken before this rotation can only be opened with it, and it cannot be recovered from here."
          />
        </Stack>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabledReason={blocked}
            loading={pending}
            onClick={deactivate}
          >
            Deactivate key
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
