import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

import { SecretRotationV2Form } from "@app/components/secret-rotations-v2/forms";
import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { SecretRotationV2ModalHeader } from "@app/components/secret-rotations-v2/SecretRotationV2ModalHeader";
import { SecretRotationV2Select } from "@app/components/secret-rotations-v2/SecretRotationV2Select";
import { Modal, ModalContent } from "@app/components/v2";
import { DocumentationLinkBadge } from "@app/components/v3";
import { ProjectEnv } from "@app/hooks/api/projects/types";
import { SecretRotation, TSecretRotationV2 } from "@app/hooks/api/secretRotationsV2";

type SharedProps = {
  secretPath: string;
  environment?: string;
  environments?: ProjectEnv[];
};

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
} & SharedProps;

type ContentProps = {
  onComplete: (secretRotation: TSecretRotationV2) => void;
  selectedRotation: SecretRotation | null;
  setSelectedRotation: (selectedRotation: SecretRotation | null) => void;
  initialFormData?: Partial<TSecretRotationV2Form>;
  onCancel: () => void;
} & SharedProps;

const Content = ({
  setSelectedRotation,
  selectedRotation,
  initialFormData,
  onCancel,
  ...props
}: ContentProps) => {
  if (selectedRotation) {
    return (
      <SecretRotationV2Form
        onCancel={onCancel}
        type={selectedRotation}
        initialFormData={initialFormData}
        {...props}
      />
    );
  }

  return <SecretRotationV2Select onSelect={setSelectedRotation} />;
};

export const CreateSecretRotationV2Modal = ({ onOpenChange, isOpen, ...props }: Props) => {
  const [selectedRotation, setSelectedRotation] = useState<SecretRotation | null>(null);
  const [initialFormData, setInitialFormData] = useState<Partial<TSecretRotationV2Form>>();

  const {
    location: {
      search: { connectionId, connectionName, ...search },
      pathname
    }
  } = useRouterState();

  const navigate = useNavigate();

  useEffect(() => {
    if (connectionId && connectionName) {
      const storedFormData = localStorage.getItem("secretRotationFormData");

      if (!storedFormData) return;

      let form: Partial<TSecretRotationV2Form> = {};
      try {
        form = JSON.parse(storedFormData) as TSecretRotationV2Form;
      } catch {
        return;
      } finally {
        localStorage.removeItem("secretRotationFormData");
      }

      onOpenChange(true);

      setSelectedRotation(form.type ?? null);

      setInitialFormData({
        ...form,
        connection: { id: connectionId, name: connectionName }
      });

      navigate({
        to: pathname,
        search
      });
    }
  }, [connectionId, connectionName]);

  const handleReset = () => {
    setSelectedRotation(null);
    setInitialFormData(undefined);
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleReset();
        }
        onOpenChange(open);
      }}
    >
      <ModalContent
        title={
          selectedRotation ? (
            <SecretRotationV2ModalHeader isConfigured={false} type={selectedRotation} />
          ) : (
            <div className="flex items-center gap-x-2 text-mineshaft-300">
              Add Secret Rotation
              <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/secret-rotation/overview" />
            </div>
          )
        }
        className={selectedRotation ? "max-w-2xl" : "max-w-3xl"}
        subTitle={
          selectedRotation ? undefined : "Select a provider to create a secret rotation for."
        }
        bodyClassName="overflow-visible"
      >
        <Content
          onComplete={() => {
            handleReset();
            onOpenChange(false);
          }}
          onCancel={handleReset}
          initialFormData={initialFormData}
          selectedRotation={selectedRotation}
          setSelectedRotation={setSelectedRotation}
          {...props}
        />
      </ModalContent>
    </Modal>
  );
};
