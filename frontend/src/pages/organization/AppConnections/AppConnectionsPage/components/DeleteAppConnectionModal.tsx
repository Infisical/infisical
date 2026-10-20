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
  AlertDialogTitle,
  AlertTitle
} from "@app/components/v3";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { TAppConnection, useDeleteAppConnection } from "@app/hooks/api/appConnections";

type Props = {
  appConnection?: TAppConnection;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const DeleteAppConnectionModal = ({ isOpen, onOpenChange, appConnection }: Props) => {
  const deleteAppConnection = useDeleteAppConnection();

  if (!appConnection) return null;

  const { id: connectionId, name, app } = appConnection;

  const handleDeleteAppConnection = async () => {
    if (deleteAppConnection.isPending) return;

    try {
      await deleteAppConnection.mutateAsync({
        connectionId,
        app
      });

      createNotification({
        text: `Successfully removed ${APP_CONNECTION_MAP[app].name} connection`,
        type: "success"
      });

      onOpenChange(false);
    } catch {
      // Error is handled by the mutation's onError handler
    }
  };

  return (
    <AlertDialog open={isOpen} confirmationValue={name} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure you want to delete {name}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <Alert variant="danger" appearance="borderless">
              <AlertDescription>This action is irreversible.</AlertDescription>
            </Alert>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {appConnection.isPlatformManagedCredentials && (
          <Alert variant="warning">
            <AlertTitle>Platform Managed Credentials</AlertTitle>
            <AlertDescription>
              This App Connection&#39;s credentials are managed by Infisical. By deleting this
              connection you may lose permanent access to the associated resource.
            </AlertDescription>
          </Alert>
        )}
        <AlertDialogConfirmationField
          onConfirm={() => {
            if (!deleteAppConnection.isPending) {
              handleDeleteAppConnection().catch(() => undefined);
            }
          }}
        />
        <AlertDialogFooter>
          <AlertDialogCancel isDisabled={deleteAppConnection.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            isPending={deleteAppConnection.isPending}
            onClick={(event) => {
              event.preventDefault();
              if (!deleteAppConnection.isPending) {
                handleDeleteAppConnection().catch(() => undefined);
              }
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
