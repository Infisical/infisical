import { createNotification } from "@app/components/notifications";
import { DeleteActionModal } from "@app/components/v2";
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
    } catch (err) {
      console.error(err);

      createNotification({
        text: `Failed to remove ${APP_CONNECTION_MAP[app].name} connection`,
        type: "error"
      });
    }
  };

  return (
    <DeleteActionModal
      isOpen={isOpen}
      onChange={onOpenChange}
      title={`Are you sure want to delete ${name}?`}
      deleteKey={name}
      onDeleteApproved={handleDeleteAppConnection}
    />
  );
};
