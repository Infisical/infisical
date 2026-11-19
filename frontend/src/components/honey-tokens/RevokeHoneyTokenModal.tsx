import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogConfirmationField,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v3";
import { useRevokeHoneyToken } from "@app/hooks/api/honeyTokens";
import { TDashboardHoneyToken } from "@app/hooks/api/honeyTokens/types";

type Props = {
  honeyToken?: TDashboardHoneyToken;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const RevokeHoneyTokenModal = ({ isOpen, onOpenChange, honeyToken }: Props) => {
  const revokeHoneyToken = useRevokeHoneyToken();

  if (!honeyToken) return null;

  const handleRevoke = async () => {
    await revokeHoneyToken.mutateAsync({
      honeyTokenId: honeyToken.id,
      projectId: honeyToken.projectId
    });

    createNotification({
      text: `Successfully revoked honey token "${honeyToken.name}"`,
      type: "success"
    });

    onOpenChange(false);
  };

  return (
    <AlertDialog
      isPending={revokeHoneyToken.isPending}
      open={isOpen}
      confirmationValue={honeyToken.name}
      onOpenChange={onOpenChange}
    >
      <AlertDialogContent className="sm:max-w-xl!">
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure you want to revoke {honeyToken.name}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <Alert variant="danger" appearance="borderless">
              <AlertDescription>
                This will revoke the AWS IAM credentials and remove the associated decoy secrets
                from this environment. The honey token record and its events will be preserved for
                audit purposes.
              </AlertDescription>
            </Alert>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogConfirmationField
          onConfirm={() => {
            handleRevoke().catch(() => undefined);
          }}
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            onClick={(event) => {
              event.preventDefault();
              handleRevoke().catch(() => undefined);
            }}
          >
            Revoke
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
