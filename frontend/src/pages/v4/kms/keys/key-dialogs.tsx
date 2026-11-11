import { useState } from "react";
import FileSaver from "file-saver";

import { Alert, AlertDescription, AlertTitle } from "@app/components/v4/ui/alert";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { Field } from "@app/components/v4/ui/field";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { Loader } from "@app/components/v4/ui/loader";
import { Snippet } from "@app/components/v4/ui/snippet";
import type { TCmek } from "@app/hooks/api/cmeks/types";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { isAsymmetricKey, type KeyPermissions } from "./shared";

type DialogProps = { cmek: TCmek; onClose: () => void };

const useConfirm = () => {
  const [pending, setPending] = useState(false);
  const confirm = async (task: () => Promise<unknown>, success: string, failure: string) => {
    setPending(true);
    try {
      await task();
      saved(success);
      return true;
    } catch (error) {
      failed(failure, error);
      return false;
    } finally {
      setPending(false);
    }
  };
  return { pending, confirm };
};

export const RotateKeyDialog = ({ cmek, onClose }: DialogProps) => {
  const rotate = useV4Adapter("kms").useRotateKey();
  const { pending, confirm } = useConfirm();
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent tone="neutral" icon="sync" confirmText={cmek.name}>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Rotate ${cmek.name}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            This generates new key material and increments the key version.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Alert tone="warn">
          <AlertTitle>Data encrypted outside Infisical may be affected</AlertTitle>
          <AlertDescription>
            Data encrypted through Infisical stays decryptable. A system that holds this key&apos;s
            material directly, such as a KMIP client or an exported copy, gets the new material and
            may not decrypt data it encrypted with the previous version. Don&apos;t rotate a key
            that&apos;s in use over KMIP.
          </AlertDescription>
        </Alert>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            loading={pending}
            onClick={async () => {
              const done = await confirm(
                () => rotate.mutateAsync({ keyId: cmek.id, projectId: cmek.projectId }),
                "Key rotated",
                "Failed to rotate key"
              );
              if (done) onClose();
            }}
          >
            Rotate key
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export const DeleteKeyDialog = ({
  cmek,
  onClose,
  onDeleted
}: DialogProps & { onDeleted: (keyId: string) => void }) => {
  const remove = useV4Adapter("kms").useDeleteKey();
  const { pending, confirm } = useConfirm();
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent tone="danger" confirmText={cmek.name}>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Delete ${cmek.name}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            Data encrypted with this key can no longer be decrypted. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            loading={pending}
            onClick={async () => {
              const done = await confirm(
                () => remove.mutateAsync({ keyId: cmek.id, projectId: cmek.projectId }),
                "Key deleted",
                "Failed to delete key"
              );
              if (!done) return;
              onDeleted(cmek.id);
              onClose();
            }}
          >
            Delete key
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const KeyMaterial = ({
  label,
  value,
  filename
}: {
  label: string;
  value: string;
  filename: string;
}) => (
  <Field label={label} wide>
    <Stack gap={8}>
      <Snippet
        label={label}
        value={value}
        maxLines={6}
        copyLabel={`Copy ${label.toLowerCase()}`}
        onCopy={() => saved(`${label} copied`)}
      />
      <Inline justify="end">
        <Button
          variant="outline"
          size="sm"
          icon="download"
          onClick={() => {
            FileSaver.saveAs(new Blob([value], { type: "text/plain;charset=utf-8" }), filename);
            saved(`${label} downloaded`);
          }}
        >
          Download
        </Button>
      </Inline>
    </Stack>
  </Field>
);

export const ExportKeyDialog = ({
  cmek,
  permissions,
  onClose
}: DialogProps & { permissions: KeyPermissions }) => {
  const kms = useV4Adapter("kms");
  const asymmetric = isAsymmetricKey(cmek);
  const canExportMaterial = permissions.exportPrivateKey && cmek.isExportable;
  const canReadPublicKey = asymmetric && permissions.read;
  const privateKey = kms.usePrivateKey(cmek.id, { enabled: canExportMaterial });
  const publicKey = kms.usePublicKey(cmek.id, { enabled: canReadPublicKey });
  const loading =
    (canExportMaterial && privateKey.isPending) || (canReadPublicKey && publicKey.isPending);
  const loadError = privateKey.error ?? publicKey.error;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Export ${cmek.name}`}</DialogTitle>
          {asymmetric && !canExportMaterial && (
            <DialogDescription>
              {cmek.isExportable
                ? "Only the public key is shown. Exporting the private key needs the export permission."
                : "Only the public key is shown. This key was created as non-exportable."}
            </DialogDescription>
          )}
        </DialogHeader>
        {loading && <Loader label="Loading key material" />}
        {!loading && loadError ? (
          <Alert tone="bad">
            <AlertTitle>Couldn&apos;t load the key material</AlertTitle>
          </Alert>
        ) : null}
        {!loading && (
          <Stack gap={16}>
            {canExportMaterial && privateKey.data?.privateKey && (
              <KeyMaterial
                label={asymmetric ? "Private key (Base64)" : "Key material (Base64)"}
                value={privateKey.data.privateKey}
                filename={`${cmek.name}_${asymmetric ? "private_key" : "key_material"}`}
              />
            )}
            {canReadPublicKey && publicKey.data?.publicKey && (
              <KeyMaterial
                label="Public key (Base64)"
                value={publicKey.data.publicKey}
                filename={`${cmek.name}_public_key`}
              />
            )}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
};
