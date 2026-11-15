import { useState } from "react";
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
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { Snippet } from "@infisical/cipher/ui/snippet";

import { CertificateAuthoritiesUpgradeIntent } from "@app/components/license/UpgradeGate/upgrade-intents";
import { downloadTxtFile } from "@app/helpers/download";
import { caStatusToNameMap } from "@app/hooks/api/ca/constants";
import { CaStatus, CaType } from "@app/hooks/api/ca/enums";
import type { TUnifiedCertificateAuthority } from "@app/hooks/api/ca/types";
import { CertKeySource } from "@app/hooks/api/signers/types";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { useUpgradeGate } from "../../license/useUpgradeGate";

const statusTone = {
  [CaStatus.ACTIVE]: "ok",
  [CaStatus.DISABLED]: "outline",
  [CaStatus.PENDING_CERTIFICATE]: "warn"
} as const;

export const CaStatusBadge = ({ status }: { status: CaStatus }) => (
  <Badge size="sm" tone={statusTone[status]} dot>
    {status === CaStatus.PENDING_CERTIFICATE ? "Pending certificate" : caStatusToNameMap[status]}
  </Badge>
);

export const useCaQuotaGate = (scope: "internal" | "external") => {
  const { data: quota } = useV4Adapter("certificateAuthorities").useCaQuota();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const limits =
    scope === "internal"
      ? [quota?.certificateAuthorities, quota?.internalCertificateAuthorities]
      : [quota?.certificateAuthorities];
  const exhausted = limits.some(
    (entry) => typeof entry?.limit === "number" && entry.used >= entry.limit
  );
  const guard = (open: () => void) => {
    if (!exhausted) {
      open();
      return;
    }
    openUpgradeGate({
      intent: CertificateAuthoritiesUpgradeIntent,
      paywallKey: scope === "internal" ? "cert-manager.ca" : "cert-manager.external-ca"
    });
  };
  return { guard, upgradeGate };
};

export type CaStatusChange = { ca: TUnifiedCertificateAuthority; status: CaStatus };

export const CaStatusDialog = ({
  change,
  onClose
}: {
  change?: CaStatusChange;
  onClose: () => void;
}) => {
  const update = useV4Adapter("certificateAuthorities").useUpdateCa();
  const [pending, setPending] = useState(false);
  const enabling = change?.status === CaStatus.ACTIVE;
  return (
    <AlertDialog open={Boolean(change)} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent tone={enabling ? "neutral" : "danger"} pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {`${enabling ? "Enable" : "Disable"} ${change?.ca.name ?? "certificate authority"}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {enabling
              ? "It starts issuing certificates again."
              : "It stops issuing new certificates. Certificates it already issued stay valid."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={enabling ? "primary" : "destructive"}
            loading={pending}
            onClick={async () => {
              if (!change) return;
              setPending(true);
              try {
                await update.mutateAsync({
                  id: change.ca.id,
                  type: change.ca.type,
                  status: change.status
                });
              } catch (error) {
                failed(`Failed to ${enabling ? "enable" : "disable"} the CA`, error);
                return;
              } finally {
                setPending(false);
              }
              saved(`${change.ca.name} ${enabling ? "enabled" : "disabled"}`);
              onClose();
            }}
          >
            {enabling ? "Enable" : "Disable"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const keyNote = (ca?: TUnifiedCertificateAuthority) => {
  if (ca?.type !== CaType.INTERNAL) return "";
  const { keySource, externalKeyId } = ca.configuration;
  if (keySource === CertKeySource.Hsm && externalKeyId)
    return ` Its key on the HSM (label ${externalKeyId}) is not removed and stays there as an orphaned key.`;
  if (keySource === CertKeySource.AwsKms && externalKeyId)
    return ` Its signing key (${externalKeyId}) is scheduled for deletion in AWS KMS, which you can cancel there within 30 days.`;
  return "";
};

export const DeleteCaDialog = ({
  ca,
  onClose,
  onDeleted
}: {
  ca?: TUnifiedCertificateAuthority;
  onClose: () => void;
  onDeleted?: () => void;
}) => {
  const remove = useV4Adapter("certificateAuthorities").useDeleteCa();
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog open={Boolean(ca)} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent tone="danger" confirmText={ca?.name} pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Delete ${ca?.name ?? "certificate authority"}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {`This also deletes the CAs and certificates below it in your CA hierarchy.${keyNote(ca)}`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            loading={pending}
            onClick={async () => {
              if (!ca) return;
              setPending(true);
              try {
                await remove.mutateAsync({ id: ca.id, type: ca.type });
              } catch (error) {
                failed("Failed to delete the CA", error);
                return;
              } finally {
                setPending(false);
              }
              saved(`${ca.name} deleted`);
              onClose();
              onDeleted?.();
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export const PemField = ({
  label,
  value,
  filename
}: {
  label: string;
  value: string;
  filename: string;
}) => (
  <Field
    label={label}
    wide
    help={
      <Button
        variant="ghost"
        size="icon"
        icon="download"
        iconOnly
        onClick={() => downloadTxtFile(filename, value)}
      >
        {`Download ${label.toLowerCase()}`}
      </Button>
    }
  >
    <Snippet label={label} value={value} maxLines={8} size="sm" />
  </Field>
);

export const CaCertificateDialog = ({ caId, onClose }: { caId?: string; onClose: () => void }) => {
  const { data, isPending, error } = useV4Adapter("certificateAuthorities").useCaCert(caId ?? "");
  return (
    <Dialog open={Boolean(caId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>CA certificate</DialogTitle>
          {data && <DialogDescription>{`Serial number ${data.serialNumber}`}</DialogDescription>}
        </DialogHeader>
        {data ? (
          <Stack gap={16}>
            <PemField label="Certificate" value={data.certificate} filename="certificate.pem" />
            {data.certificateChain && (
              <PemField
                label="Certificate chain"
                value={data.certificateChain}
                filename="certificate-chain.pem"
              />
            )}
          </Stack>
        ) : (
          <Loader
            label={
              error && !isPending ? "Failed to load the CA certificate" : "Loading certificate"
            }
          />
        )}
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
};
