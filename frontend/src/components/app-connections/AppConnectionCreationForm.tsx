import { useState } from "react";

import { isAzureManagedIdentityConnection } from "@app/helpers/appConnections";
import { TAppConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { ProjectType } from "@app/hooks/api/projects/types";
import { AppConnectionForm } from "@app/pages/organization/AppConnections/AppConnectionsPage/components/AppConnectionForm";

type Props = {
  app: AppConnection;
  projectId?: string;
  projectType?: ProjectType;
  onDirtyChange: (isDirty: boolean) => void;
  onPendingChange: (isPending: boolean) => void;
  onCreated: (connection: TAppConnection) => void;
  onComplete: VoidFunction;
  onCancel: VoidFunction;
};

export const AppConnectionCreationForm = ({
  app,
  projectId,
  projectType,
  onDirtyChange,
  onPendingChange,
  onCreated,
  onComplete,
  onCancel
}: Props) => {
  const [createdConnection, setCreatedConnection] = useState<TAppConnection | null>(null);

  if (createdConnection) {
    return (
      <AppConnectionForm
        appConnection={createdConnection}
        isNewConnection
        layout="dialog"
        onDirtyChange={onDirtyChange}
        onPendingChange={onPendingChange}
        onComplete={onComplete}
        onCancel={onCancel}
      />
    );
  }

  return (
    <AppConnectionForm
      app={app}
      layout="dialog"
      projectId={projectId}
      projectType={projectType}
      onDirtyChange={onDirtyChange}
      onPendingChange={onPendingChange}
      onComplete={(connection) => {
        onCreated(connection);

        // Azure can only be told to trust a managed identity connection once it has an ID, so the dialog stays open on
        // its credentials, which show the federated credential values and verify the setup
        if (isAzureManagedIdentityConnection(connection)) {
          setCreatedConnection(connection);
          return;
        }

        onComplete();
      }}
      onCancel={onCancel}
    />
  );
};
