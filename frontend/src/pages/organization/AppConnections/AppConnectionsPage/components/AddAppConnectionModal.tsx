import { useState } from "react";

import { Modal, ModalContent } from "@app/components/v2";
import { TAppConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { ProjectType } from "@app/hooks/api/workspace/types";

import { AppConnectionForm } from "./AppConnectionForm";
import { AppConnectionsSelect } from "./AppConnectionList";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId?: string;
  projectType?: ProjectType;
  app?: AppConnection;
  onComplete?: (appConnection: TAppConnection) => void;
};

type ContentProps = {
  onComplete: (appConnection: TAppConnection) => void;
  projectId?: string;
  projectType?: ProjectType;
  app?: AppConnection;
};

const Content = ({ onComplete, projectId, projectType, app }: ContentProps) => {
  const [selectedApp, setSelectedApp] = useState<AppConnection | null>(null);

  if (app ?? selectedApp) {
    return (
      <AppConnectionForm
        onComplete={onComplete}
        onBack={app ? undefined : () => setSelectedApp(null)}
        app={(app ?? selectedApp)!}
        projectId={projectId}
      />
    );
  }

  return <AppConnectionsSelect onSelect={setSelectedApp} projectType={projectType} />;
};

export const AddAppConnectionModal = ({
  isOpen,
  onOpenChange,
  projectId,
  projectType,
  app,
  onComplete
}: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-2xl"
        title="Add Connection"
        subTitle="Select a third-party app to connect to."
      >
        <Content
          projectId={projectId}
          projectType={projectType}
          app={app}
          onComplete={(appConnection) => {
            if (onComplete) onComplete(appConnection);
            onOpenChange(false);
          }}
        />
      </ModalContent>
    </Modal>
  );
};
