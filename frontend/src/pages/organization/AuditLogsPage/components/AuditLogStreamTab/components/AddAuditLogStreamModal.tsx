import { Dispatch, SetStateAction, useState } from "react";

import { Modal, ModalContent } from "@app/components/v2";
import { LogProvider } from "@app/hooks/api/auditLogStreams/enums";
import { TAuditLogStream } from "@app/hooks/api/types";

import { AuditLogStreamForm } from "../AuditLogStreamForm/AuditLogStreamForm";
import { LogStreamProviderSelect } from "./LogStreamProviderSelect";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

type ContentProps = {
  onComplete: (auditLogStream: TAuditLogStream) => void;
  selectedProvider: LogProvider | null;
  setSelectedProvider: Dispatch<SetStateAction<LogProvider | null>>;
};

const Content = ({ onComplete, selectedProvider, setSelectedProvider }: ContentProps) => {
  if (selectedProvider) {
    return (
      <AuditLogStreamForm
        onComplete={onComplete}
        onBack={() => setSelectedProvider(null)}
        provider={selectedProvider}
      />
    );
  }

  return <LogStreamProviderSelect onSelect={setSelectedProvider} />;
};

export const AddAuditLogStreamModal = ({ isOpen, onOpenChange }: Props) => {
  const [selectedProvider, setSelectedProvider] = useState<LogProvider | null>(null);

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(e) => {
        onOpenChange(e);
        if (!e) setSelectedProvider(null);
      }}
    >
      <ModalContent
        className="max-w-2xl"
        title="Log Provider"
        subTitle=<>
          Select a log provider or{" "}
          <button
            type="button"
            className="underline"
            onClick={() => setSelectedProvider(LogProvider.Custom)}
          >
            input a custom URL
          </button>{" "}
          to stream logs to.
        </>
      >
        <Content
          onComplete={() => onOpenChange(false)}
          selectedProvider={selectedProvider}
          setSelectedProvider={setSelectedProvider}
        />
      </ModalContent>
    </Modal>
  );
};
