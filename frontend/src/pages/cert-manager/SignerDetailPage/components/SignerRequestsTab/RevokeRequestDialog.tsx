import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v3";
import {
  SignerRequestStatus,
  TSignerRequest,
  useRevokeSignerRequest
} from "@app/hooks/api/signers";

type Props = {
  signerId: string;
  target: TSignerRequest | null;
  onOpenChange: (open: boolean) => void;
};

export const RevokeRequestDialog = ({ signerId, target, onOpenChange }: Props) => {
  const revoke = useRevokeSignerRequest();
  const isPending = target?.status === SignerRequestStatus.Pending;

  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isPending ? "Cancel pending request?" : "Cancel active approval?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isPending
              ? "The request will be cancelled and the member won't be able to sign under it. They can request again at any time."
              : "The active approval will be revoked immediately. Any remaining signings under it will be blocked. A new approval will be required to sign again."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel isDisabled={revoke.isPending}>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            isDisabled={revoke.isPending}
            onClick={async () => {
              if (!target) return;
              try {
                await revoke.mutateAsync({ signerId, requestId: target.id });
                onOpenChange(false);
              } catch (err) {
                createNotification({
                  type: "error",
                  text: err instanceof Error ? err.message : "Failed to revoke request"
                });
              }
            }}
          >
            {isPending ? "Cancel request" : "Revoke approval"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
