import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";

import { SecretRotationV2Form } from "@app/components/secret-rotations-v2/forms";
import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import {
  SecretRotationSheet,
  SecretRotationSheetContainer,
  SecretRotationSheetContent,
  SecretRotationSheetDescription,
  SecretRotationSheetHeader,
  SecretRotationSheetScrollArea,
  SecretRotationSheetTitle
} from "@app/components/secret-rotations-v2/SecretRotationSheet";
import { SecretRotationV2ModalHeader } from "@app/components/secret-rotations-v2/SecretRotationV2ModalHeader";
import { SecretRotationV2Select } from "@app/components/secret-rotations-v2/SecretRotationV2Select";
import {
  DiscardChangesAlert,
  DocumentationLinkBadge,
  useUnsavedChangesGuard
} from "@app/components/v3";
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
  onDirtyChange?: (isDirty: boolean) => void;
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
        isSheet
        type={selectedRotation}
        initialFormData={initialFormData}
        {...props}
      />
    );
  }

  return (
    <SecretRotationSheetScrollArea>
      <SecretRotationSheetContainer>
        <SecretRotationSheetHeader>
          <SecretRotationSheetTitle className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Add Secret Rotation</span>
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/secret-rotation/overview" />
          </SecretRotationSheetTitle>
          <SecretRotationSheetDescription>
            Select a provider to create a secret rotation for.
          </SecretRotationSheetDescription>
        </SecretRotationSheetHeader>
        <SecretRotationV2Select onSelect={setSelectedRotation} />
      </SecretRotationSheetContainer>
    </SecretRotationSheetScrollArea>
  );
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
    setIsDirty(false);
  };

  const applyOpenChange = (open: boolean) => {
    if (!open) {
      handleReset();
    }
    onOpenChange(open);
  };

  const {
    onOpenChange: guardedOpenChange,
    confirmIfDirty,
    discardAlertProps
  } = useUnsavedChangesGuard({
    isDirty,
    onOpenChange: applyOpenChange
  });

  const contentProps = {
    onComplete: () => {
      handleReset();
      onOpenChange(false);
    },
    onCancel: () => {
      confirmIfDirty(handleReset);
    },
    onDirtyChange: setIsDirty,
    initialFormData,
    selectedRotation,
    setSelectedRotation,
    ...props
  };

  return (
    <>
      <SecretRotationSheet open={isOpen} onOpenChange={guardedOpenChange}>
        <SecretRotationSheetContent>
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedRotation ? `rotation-${selectedRotation}` : "select-rotation"}
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
              transition={{ duration: 0.1 }}
              initial={{ opacity: 0, translateX: 30 }}
              animate={{ opacity: 1, translateX: 0 }}
              exit={{ opacity: 0, translateX: -30 }}
            >
              {selectedRotation ? (
                <>
                  <div className="shrink-0 border-b border-border p-6">
                    <SecretRotationV2ModalHeader isConfigured={false} type={selectedRotation} />
                  </div>
                  <Content {...contentProps} />
                </>
              ) : (
                <Content {...contentProps} />
              )}
            </motion.div>
          </AnimatePresence>
        </SecretRotationSheetContent>
      </SecretRotationSheet>
      <DiscardChangesAlert
        {...discardAlertProps}
        title="Discard secret rotation?"
        description="Your unsaved changes to this secret rotation will be lost."
      />
    </>
  );
};
