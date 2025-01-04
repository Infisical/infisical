import { useState } from "react";

import { Modal, ModalContent } from "@app/components/v2";
import { TAppConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AppConnectionForm } from "./AppConnectionForm";
import { AppConnectionsSelect } from "./AppConnectionList";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

type ContentProps = {
  onComplete: (appConnection: TAppConnection) => void;
};

const Content = ({ onComplete }: ContentProps) => {
  const [selectedApp, setSelectedApp] = useState<AppConnection | null>(null);

  if (selectedApp) {
    return (
      <AppConnectionForm
        onComplete={onComplete}
        onBack={() => setSelectedApp(null)}
        app={selectedApp}
      />
    );
  }

  return <AppConnectionsSelect onSelect={setSelectedApp} />;
};

export const AddAppConnectionModal = ({ isOpen, onOpenChange }: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-2xl"
        title="Add Connection"
        subTitle="Select a third-party app to connect to."
      >
        <Content onComplete={() => onOpenChange(false)} />
      </ModalContent>
    </Modal>
  );
};
