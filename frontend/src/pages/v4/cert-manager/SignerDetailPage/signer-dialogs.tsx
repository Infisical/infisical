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
import { Stack } from "@infisical/cipher/ui/layout";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { Snippet } from "@infisical/cipher/ui/snippet";
import FileSaver from "file-saver";

import type { TSigner } from "@app/hooks/api/signers/types";

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
  isDigicert,
  onClose,
  onDeleted
}: {
  signer: TSigner;
  open: boolean;
  isDigicert: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) => {
  const remove = useV4Adapter("codeSigning").useDeleteSigner();
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      <AlertDialogContent tone="danger" confirmText={signer.name} pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Delete ${signer.name}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the signer, its policy, members, requests and signing history. The
            certificate is kept for audit, but signing stops immediately.
            {isDigicert &&
              " It also revokes the certificate's DigiCert order, so the certificate can't sign anywhere."}
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
