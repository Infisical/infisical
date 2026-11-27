import { useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
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
import { Button } from "@infisical/cipher/ui/button";
import { CodeBlock } from "@infisical/cipher/ui/code-block";
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
import { Select } from "@infisical/cipher/ui/select";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { Snippet } from "@infisical/cipher/ui/snippet";
import FileSaver from "file-saver";

import { CaType } from "@app/hooks/api/ca/enums";
import { crlReasons } from "@app/hooks/api/certificates/constants";
import { CrlReason } from "@app/hooks/api/certificates/enums";
import {
  getNextDigicertOrderId,
  getOpenCertificateRequest,
  SignerStatus,
  type TSigner
} from "@app/hooks/api/signers/types";

import { failed } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";

export const ExportSignerCertificateDialog = ({
  signer,
  open,
  onClose
}: {
  signer: TSigner;
  open: boolean;
  onClose: () => void;
}) => {
  const { data, isPending } = useV4Adapter("codeSigning").useSignerCertificate(signer.id, open);
  const download = () => {
    if (!data?.certificatePem) return;
    try {
      FileSaver.saveAs(
        new Blob([data.certificatePem], { type: "application/x-pem-file" }),
        `${signer.name || data.signerName || "signer"}.pem`
      );
    } catch (error) {
      failed("Couldn't download the certificate", error);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export certificate</DialogTitle>
          <DialogDescription>
            The signer&apos;s public certificate. The private key never leaves the server and
            isn&apos;t included.
          </DialogDescription>
        </DialogHeader>
        {isPending || !data ? (
          <Stack gap={12}>
            <Skeleton height={36} />
            <Skeleton height={180} />
          </Stack>
        ) : (
          <Stack gap={16}>
            <Snippet label="Serial number" value={data.serialNumber || "None"} copyable />
            <CodeBlock
              label="Certificate body"
              code={data.certificatePem}
              copyable
              copyLabel="Copy PEM"
              actions={
                <Button variant="ghost" size="sm" icon="download" onClick={download}>
                  Download
                </Button>
              }
            />
          </Stack>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const DeleteSignerDialog = ({
  signer,
  open,
  onClose,
  onDeleted
}: {
  signer: TSigner;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) => {
  const remove = useV4Adapter("codeSigning").useDeleteSigner();
  const [pending, setPending] = useState(false);
  const nextDigicertOrderId = getNextDigicertOrderId(signer);
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      <AlertDialogContent tone="danger" confirmText={signer.name} pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Delete ${signer.name}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the signer, its policy, members, requests and signing history. The
            certificate is kept for audit, but signing stops immediately.
            {signer.caType === CaType.DIGICERT &&
              " It also revokes the certificate on DigiCert, so it can't sign anywhere. Other certificates on the same order stay valid."}
            {signer.caType === CaType.DIGICERT &&
              nextDigicertOrderId &&
              ` DigiCert order #${nextDigicertOrderId} is canceled too.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={async (event) => {
              event.preventDefault();
              setPending(true);
              try {
                await remove.mutateAsync({ signerId: signer.id, projectId: signer.projectId });
              } catch (error) {
                failed(`Couldn't delete ${signer.name}`, error);
                return;
              } finally {
                setPending(false);
              }
              onClose();
              onDeleted();
            }}
          >
            Delete signer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const REVOCATION_REASONS = crlReasons.filter(({ value }) => value !== CrlReason.CERTIFICATE_HOLD);

const ADCS_UNSUPPORTED_REASONS: CrlReason[] = [
  CrlReason.PRIVILEGE_WITHDRAWN,
  CrlReason.A_A_COMPROMISE
];

const revocationReasonsFor = (caType?: CaType | null) =>
  caType === CaType.ADCS
    ? REVOCATION_REASONS.filter(({ value }) => !ADCS_UNSUPPORTED_REASONS.includes(value))
    : REVOCATION_REASONS;

export const RevokeSignerCertificateDialog = ({
  signer,
  open,
  onClose
}: {
  signer: TSigner;
  open: boolean;
  onClose: () => void;
}) => {
  const revoke = useV4Adapter("codeSigning").useRevokeSignerCertificate();
  const [reason, setReason] = useState<CrlReason>(CrlReason.UNSPECIFIED);
  const [pending, setPending] = useState(false);
  const openDigicertOrderId = getNextDigicertOrderId(signer);
  const close = () => {
    setReason(CrlReason.UNSPECIFIED);
    onClose();
  };
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !pending && close()}>
      <AlertDialogContent tone="danger" icon="shield" pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Revoke the certificate for ${signer.name}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            The signer stops signing right away. To sign again, use Reissue certificate, which
            issues the certificate with a new key. Signatures made before the revocation may stop
            validating.
            {getOpenCertificateRequest(signer) &&
              (openDigicertOrderId
                ? ` This also cancels the pending certificate request, including DigiCert order #${openDigicertOrderId}.`
                : " This also cancels the pending certificate request.")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Stack gap={16}>
          {signer.caType === CaType.DIGICERT && (
            <Alert tone="warn">
              If your CertCentral account requires approval for revocations, the certificate stays
              valid until an administrator approves the request in CertCentral. The signer
              can&apos;t sign in the meantime, and goes back to its earlier status if the request is
              rejected.
            </Alert>
          )}
          <Field label="Revocation reason">
            <Select
              aria-label="Revocation reason"
              options={revocationReasonsFor(signer.caType)}
              value={reason}
              onChange={(next) => setReason(next as CrlReason)}
            />
          </Field>
        </Stack>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            loading={pending}
            onClick={async () => {
              setPending(true);
              try {
                await revoke.mutateAsync({ signerId: signer.id, revocationReason: reason });
              } catch (error) {
                failed(`Couldn't revoke the certificate for ${signer.name}`, error);
              } finally {
                setPending(false);
              }
              close();
            }}
          >
            Revoke certificate
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export const RenewSignerCertificateDialog = ({
  signer,
  open,
  onClose
}: {
  signer: TSigner;
  open: boolean;
  onClose: () => void;
}) => {
  const renew = useV4Adapter("codeSigning").useRenewSignerCertificate();
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      <AlertDialogContent pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Renew the certificate for ${signer.name}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            This requests a new certificate from the signer&apos;s certificate authority.
            {signer.status === SignerStatus.Active &&
              " The signer keeps signing with its current certificate until the new one is issued."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {signer.caType === CaType.DIGICERT && (
          <Alert tone="warn">
            This places a renewal order on DigiCert. If your account has no unused code signing
            subscription, the current order is reissued instead, and DigiCert revokes the current
            certificate within 72 hours.
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            loading={pending}
            onClick={async () => {
              setPending(true);
              try {
                await renew.mutateAsync(signer.id);
                onClose();
              } catch (error) {
                failed(`Couldn't renew the certificate for ${signer.name}`, error);
              } finally {
                setPending(false);
              }
            }}
          >
            Renew certificate
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export const ReissueSignerCertificateDialog = ({
  signer,
  open,
  onClose
}: {
  signer: TSigner;
  open: boolean;
  onClose: () => void;
}) => {
  const reissue = useV4Adapter("codeSigning").useReissueSignerCertificate();
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      <AlertDialogContent pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Reissue the certificate for ${signer.name}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            This issues a new certificate with a new key from the signer&apos;s certificate
            authority, so the signer can sign again.
            {signer.caType === CaType.DIGICERT && " This places a new DigiCert order."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            loading={pending}
            onClick={async () => {
              if (!signer.caId) return;
              setPending(true);
              try {
                await reissue.mutateAsync({ signerId: signer.id, caId: signer.caId });
                onClose();
              } catch (error) {
                failed(`Couldn't reissue the certificate for ${signer.name}`, error);
              } finally {
                setPending(false);
              }
            }}
          >
            Reissue certificate
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
