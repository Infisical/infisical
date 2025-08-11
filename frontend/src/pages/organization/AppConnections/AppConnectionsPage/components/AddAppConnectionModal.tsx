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
};

type ContentProps = {
  onComplete: (appConnection: TAppConnection) => void;
  projectId?: string;
  projectType?: ProjectType;
};

const Content = ({ onComplete, projectId, projectType }: ContentProps) => {
  const [selectedApp, setSelectedApp] = useState<AppConnection | null>(null);

  if (selectedApp) {
    return (
      <AppConnectionForm
        onComplete={onComplete}
        onBack={() => setSelectedApp(null)}
        app={selectedApp}
        projectId={projectId}
        projectType={projectType}
      />
    );
  }

  return <AppConnectionsSelect onSelect={setSelectedApp} projectType={projectType} />;
};

export const AddAppConnectionModal = ({ isOpen, onOpenChange, projectId, projectType }: Props) => {
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
          onComplete={() => onOpenChange(false)}
        />
      </ModalContent>
    </Modal>
  );
};
