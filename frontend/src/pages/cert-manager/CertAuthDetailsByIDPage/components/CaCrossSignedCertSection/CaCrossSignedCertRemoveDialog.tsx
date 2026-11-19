import { useState } from "react";
import { TrashIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle
} from "@app/components/v3";
import { useDeleteCaCrossSignedCert } from "@app/hooks/api";

type Props = {
  caId: string;
  caName: string;
  trustedRootName: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const CaCrossSignedCertRemoveDialog = ({
  caId,
  caName,
  trustedRootName,
  isOpen,
  onOpenChange
}: Props) => {
  const { mutateAsync: deleteCrossSignedCert, isPending } = useDeleteCaCrossSignedCert();
  const [shownTrustedRootName, setShownTrustedRootName] = useState(trustedRootName);
  if (isOpen && trustedRootName && trustedRootName !== shownTrustedRootName) {
    setShownTrustedRootName(trustedRootName);
  }

  const handleConfirm = async () => {
    if (isPending) return;
    await deleteCrossSignedCert({ caId });
    createNotification({ text: "Cross-signed certificate removed", type: "success" });
    onOpenChange(false);
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange} isPending={isPending}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <TrashIcon className="h-5 w-5 text-danger" />
          </AlertDialogMedia>
          <AlertDialogTitle>Remove Cross-Signed Certificate</AlertDialogTitle>
          <AlertDialogDescription>
            Clients that only trust {shownTrustedRootName} won&apos;t trust new certificates from{" "}
            {caName} or the CAs under it. Certificates already issued don&apos;t change.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            isPending={isPending}
            isDisabled={isPending}
            onClick={(event) => {
              event.preventDefault();
              handleConfirm().catch(() => undefined);
            }}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
