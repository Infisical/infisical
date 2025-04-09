import { useState } from "react";

import { SecretRotationV2Form } from "@app/components/secret-rotations-v2/forms";
import { SecretRotationV2ModalHeader } from "@app/components/secret-rotations-v2/SecretRotationV2ModalHeader";
import { SecretRotationV2Select } from "@app/components/secret-rotations-v2/SecretRotationV2Select";
import { Modal, ModalContent } from "@app/components/v2";
import { SecretRotation, TSecretRotationV2 } from "@app/hooks/api/secretRotationsV2";
import { WorkspaceEnv } from "@app/hooks/api/workspace/types";

type SharedProps = {
  secretPath: string;
  environment?: string;
  environments?: WorkspaceEnv[];
};

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
} & SharedProps;

type ContentProps = {
  onComplete: (secretRotation: TSecretRotationV2) => void;
  selectedRotation: SecretRotation | null;
  setSelectedRotation: (selectedRotation: SecretRotation | null) => void;
} & SharedProps;

const Content = ({ setSelectedRotation, selectedRotation, ...props }: ContentProps) => {
  if (selectedRotation) {
    return (
      <SecretRotationV2Form
        onCancel={() => setSelectedRotation(null)}
        type={selectedRotation}
        {...props}
      />
    );
  }

  return <SecretRotationV2Select onSelect={setSelectedRotation} />;
};

export const CreateSecretRotationV2Modal = ({ onOpenChange, isOpen, ...props }: Props) => {
  const [selectedRotation, setSelectedRotation] = useState<SecretRotation | null>(null);

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) setSelectedRotation(null);
        onOpenChange(open);
      }}
    >
      <ModalContent
        title={
          selectedRotation ? (
            <SecretRotationV2ModalHeader isConfigured={false} type={selectedRotation} />
          ) : (
            "Add Secret Rotation"
          )
        }
        onPointerDownOutside={(e) => e.preventDefault()}
        className={selectedRotation ? "max-w-2xl" : "max-w-3xl"}
        subTitle={
          selectedRotation ? undefined : "Select a provider to create a secret rotation for."
        }
        bodyClassName="overflow-visible"
      >
        <Content
          onComplete={() => {
            setSelectedRotation(null);
            onOpenChange(false);
          }}
          selectedRotation={selectedRotation}
          setSelectedRotation={setSelectedRotation}
          {...props}
        />
      </ModalContent>
    </Modal>
  );
};
