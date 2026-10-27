import { useId, useState } from "react";

import {
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { crlReasons } from "@app/hooks/api/certificates/constants";
import { CrlReason } from "@app/hooks/api/certificates/enums";
import { TSigner, useRevokeSignerCertificate } from "@app/hooks/api/signers";

const REVOCATION_REASONS = crlReasons.filter(({ value }) => value !== CrlReason.CERTIFICATE_HOLD);

type Props = {
  signer: TSigner;
  isDigicertSigner: boolean;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const RevokeSignerCertificateDialog = ({
  signer,
  isDigicertSigner,
  isOpen,
  onOpenChange
}: Props) => {
  const reasonId = useId();
  const [revocationReason, setRevocationReason] = useState<CrlReason>(CrlReason.UNSPECIFIED);
  const revokeCertificate = useRevokeSignerCertificate();

  const handleOpenChange = (open: boolean) => {
    if (!open) setRevocationReason(CrlReason.UNSPECIFIED);
    onOpenChange(open);
  };

  const onRevoke = async () => {
    await revokeCertificate.mutateAsync({ signerId: signer.id, revocationReason });
    handleOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent isPending={revokeCertificate.isPending}>
        <DialogHeader>
          <DialogTitle>Revoke Certificate</DialogTitle>
          <DialogDescription>
            This can&apos;t be undone. Create a new signer to keep signing. Signatures made before
            revocation may stop validating.
            {isDigicertSigner && (
              <span className="mt-2 block font-medium text-warning">
                {signer.externalOrder
                  ? `This also revokes every other certificate on DigiCert order #${signer.externalOrder.orderId}.`
                  : "This also revokes every other certificate on the DigiCert order."}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field>
            <FieldLabel htmlFor={reasonId}>Revocation Reason</FieldLabel>
            <Select
              value={revocationReason}
              onValueChange={(value) => setRevocationReason(value as CrlReason)}
              disabled={revokeCertificate.isPending}
            >
              <SelectTrigger id={reasonId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REVOCATION_REASONS.map(({ label, value }) => (
                  <SelectItem value={value} key={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" isDisabled={revokeCertificate.isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button variant="danger" onClick={onRevoke} isPending={revokeCertificate.isPending}>
            Revoke
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
