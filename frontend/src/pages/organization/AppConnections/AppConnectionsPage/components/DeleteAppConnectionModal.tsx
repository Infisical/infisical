import { useEffect, useState } from "react";
import { Trash2Icon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertTitle,
  Field,
  FieldContent,
  FieldLabel,
  Input
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
  const [inputData, setInputData] = useState("");

  useEffect(() => {
    setInputData("");
  }, [isOpen]);

  if (!appConnection) return null;

  const { id: connectionId, name, app } = appConnection;
  const isConfirmed = inputData === name;

  const handleDeleteAppConnection = async () => {
    if (!isConfirmed) return;

    await deleteAppConnection.mutateAsync({
      connectionId,
      app
    });

    createNotification({
      text: `Successfully removed ${APP_CONNECTION_MAP[app].name} connection`,
      type: "success"
    });

    onOpenChange(false);
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>Are you sure you want to delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>This action is irreversible.</AlertDialogDescription>
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleDeleteAppConnection();
          }}
        >
          <Field>
            <FieldLabel>
              Type <span className="font-bold">{name}</span> to confirm
            </FieldLabel>
            <FieldContent>
              <Input
                value={inputData}
                onChange={(e) => setInputData(e.target.value)}
                placeholder={`Type ${name} here`}
                autoComplete="off"
              />
            </FieldContent>
          </Field>
        </form>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            onClick={handleDeleteAppConnection}
            disabled={!isConfirmed}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
