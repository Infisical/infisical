import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

import { SecretRotationV2Form } from "@app/components/secret-rotations-v2/forms";
import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { SecretRotationV2ModalHeader } from "@app/components/secret-rotations-v2/SecretRotationV2ModalHeader";
import { SecretRotationV2Select } from "@app/components/secret-rotations-v2/SecretRotationV2Select";
import {
  DiscardChangesAlertDialog,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { ProjectEnv } from "@app/hooks/api/projects/types";
import { SecretRotation, TSecretRotationV2 } from "@app/hooks/api/secretRotationsV2";
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";

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
  onDirtyChange: (isDirty: boolean) => void;
} & SharedProps;

const Content = ({
  setSelectedRotation,
  selectedRotation,
  initialFormData,
  onCancel,
  onDirtyChange,
  ...props
}: ContentProps) => {
  if (selectedRotation) {
    return (
      <SecretRotationV2Form
        onCancel={onCancel}
        onDirtyChange={onDirtyChange}
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
  const [isDirty, setIsDirty] = useState(false);

  const {
    location: {
      search: { connectionId, connectionName, ...search },
      pathname
    }
  } = useRouterState();
  const navigate = useNavigate();

  useEffect(() => {
    if (!connectionId || !connectionName) return;

    const storedFormData = localStorage.getItem("secretRotationFormData");
    localStorage.removeItem("secretRotationFormData");

    if (storedFormData) {
      try {
        const form = JSON.parse(storedFormData) as Partial<TSecretRotationV2Form>;
        if (form.type) {
          setSelectedRotation(form.type);
          setInitialFormData({
            ...form,
            connection: { id: connectionId, name: connectionName }
          });
          setIsDirty(false);
          onOpenChange(true);
        }
      } catch {
        setSelectedRotation(null);
        setInitialFormData(undefined);
      }
    }

    navigate({
      to: pathname,
      search
    });
  }, [connectionId, connectionName]);

  const handleReset = () => {
    setSelectedRotation(null);
    setInitialFormData(undefined);
    setIsDirty(false);
  };

  const closeSheet = () => {
    handleReset();
    onOpenChange(false);
  };

  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: closeSheet });

  const handleSheetOpenChange = (open: boolean) => {
    if (!open) {
      requestDiscard();
      return;
    }
    onOpenChange(true);
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={handleSheetOpenChange}>
        <SheetContent className="flex h-full max-h-full w-full flex-col gap-y-0 p-0 sm:w-3/4 sm:max-w-[1500px]">
          <SheetHeader>
            {selectedRotation ? (
              <>
                <SheetTitle className="sr-only">Configure secret rotation</SheetTitle>
                <SecretRotationV2ModalHeader isConfigured={false} type={selectedRotation} />
              </>
            ) : (
              <>
                <SheetTitle>Choose a rotation provider</SheetTitle>
                <SheetDescription>
                  Select the provider whose credentials Infisical should rotate.
                </SheetDescription>
              </>
            )}
          </SheetHeader>

          {selectedRotation ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <Content
                onComplete={closeSheet}
                onCancel={handleReset}
                onDirtyChange={setIsDirty}
                initialFormData={initialFormData}
                selectedRotation={selectedRotation}
                setSelectedRotation={setSelectedRotation}
                {...props}
              />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
              <Content
                onComplete={closeSheet}
                onCancel={handleReset}
                onDirtyChange={setIsDirty}
                initialFormData={initialFormData}
                selectedRotation={selectedRotation}
                setSelectedRotation={setSelectedRotation}
                {...props}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Secret Rotation Setup?"
        description="Your progress configuring this secret rotation will be lost."
      />
    </>
  );
};
