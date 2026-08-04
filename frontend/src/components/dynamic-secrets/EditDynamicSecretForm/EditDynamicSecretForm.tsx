import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2Icon } from "lucide-react";

import {
  DiscardChangesAlert,
  DocumentationLinkBadge,
  useUnsavedChangesGuard
} from "@app/components/v3";
import { useGetDynamicSecretDetails } from "@app/hooks/api";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { DynamicSecretProviderForm } from "../DynamicSecretProviderForm";
import { getDynamicSecretProviderDefinition } from "../DynamicSecretProviderForm/providerDefinitions/registry";
import {
  DynamicSecretSheet,
  DynamicSecretSheetContainer,
  DynamicSecretSheetContent,
  DynamicSecretSheetDescription,
  DynamicSecretSheetHeader,
  DynamicSecretSheetInputSection,
  DynamicSecretSheetScrollArea,
  DynamicSecretSheetTitle
} from "../DynamicSecretSheet";

type Props = {
  isOpen?: boolean;
  onOpenChange: (isOpen: boolean) => void;
  dynamicSecretName?: string;
  projectSlug: string;
  environment: string;
  secretPath: string;
};

export const EditDynamicSecretForm = ({
  isOpen,
  onOpenChange,
  dynamicSecretName,
  environment,
  projectSlug,
  secretPath
}: Props) => {
  const [isDirty, setIsDirty] = useState(false);

  const {
    onOpenChange: handleOpenChange,
    requestClose,
    discardAlertProps
  } = useUnsavedChangesGuard({
    isDirty,
    onOpenChange
  });

  const { data: dynamicSecretDetails, isPending: isDynamicSecretLoading } =
    useGetDynamicSecretDetails({
      projectSlug,
      environmentSlug: environment,
      name: isOpen && dynamicSecretName ? dynamicSecretName : "",
      path: secretPath
    });

  const providerType = dynamicSecretDetails?.type as DynamicSecretProviders | undefined;
  const definition = providerType ? getDynamicSecretProviderDefinition(providerType) : null;

  const editHeader = (
    <DynamicSecretSheetHeader>
      <DynamicSecretSheetTitle className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>Edit Dynamic Secret</span>
        <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/dynamic-secrets/overview" />
      </DynamicSecretSheetTitle>
      <DynamicSecretSheetDescription>
        Update dynamic secret parameters
      </DynamicSecretSheetDescription>
    </DynamicSecretSheetHeader>
  );

  return (
    <>
      <DynamicSecretSheet open={isOpen} onOpenChange={handleOpenChange}>
        <DynamicSecretSheetContent>
          {isDynamicSecretLoading ? (
            <DynamicSecretSheetScrollArea>
              <DynamicSecretSheetContainer>
                {editHeader}
                <DynamicSecretSheetInputSection>
                  <div className="flex w-full items-center justify-center py-6">
                    <Loader2Icon className="size-6 animate-spin text-muted" />
                  </div>
                </DynamicSecretSheetInputSection>
              </DynamicSecretSheetContainer>
            </DynamicSecretSheetScrollArea>
          ) : (
            <AnimatePresence mode="wait">
              {providerType && definition && dynamicSecretDetails && (
                <motion.div
                  key={`${providerType}-provider-edit`}
                  className="flex min-h-0 flex-1 flex-col overflow-hidden"
                  transition={{ duration: 0.1 }}
                  initial={{ opacity: 0, translateX: 30 }}
                  animate={{ opacity: 1, translateX: 0 }}
                  exit={{ opacity: 0, translateX: -30 }}
                >
                  <DynamicSecretProviderForm
                    mode="edit"
                    definition={definition}
                    header={editHeader}
                    onCompleted={() => onOpenChange(false)}
                    onCancel={requestClose}
                    onDirtyChange={setIsDirty}
                    projectSlug={projectSlug}
                    secretPath={secretPath}
                    dynamicSecret={dynamicSecretDetails}
                    environment={environment}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </DynamicSecretSheetContent>
      </DynamicSecretSheet>
      <DiscardChangesAlert
        {...discardAlertProps}
        title="Discard changes?"
        description="Your unsaved changes to this dynamic secret will be lost."
      />
    </>
  );
};
