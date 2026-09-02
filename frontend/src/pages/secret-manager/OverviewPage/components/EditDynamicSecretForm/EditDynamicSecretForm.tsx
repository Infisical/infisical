import { useState } from "react";

import {
  DynamicSecretProviderForm,
  dynamicSecretProviderRegistry
} from "@app/components/dynamic-secrets";
import {
  Alert,
  AlertDescription,
  DiscardChangesAlertDialog,
  PageLoader,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { useGetDynamicSecretDetails } from "@app/hooks/api";
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";

type Props = {
  isOpen: boolean;
  onToggle: (isOpen: boolean) => void;
  dynamicSecretName: string;
  projectSlug: string;
  environment: string;
  secretPath: string;
};

export const EditDynamicSecretForm = ({
  isOpen,
  dynamicSecretName,
  environment,
  projectSlug,
  onToggle,
  secretPath
}: Props) => {
  const [isDirty, setIsDirty] = useState(false);
  const close = () => {
    setIsDirty(false);
    onToggle(false);
  };
  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: close });
  const { data: dynamicSecret, isPending } = useGetDynamicSecretDetails({
    projectSlug,
    environmentSlug: environment,
    name: dynamicSecretName,
    path: secretPath
  });

  let content = <PageLoader />;
  if (!dynamicSecret) {
    content = (
      <Alert variant="danger">
        <AlertDescription>Unable to load this dynamic secret.</AlertDescription>
      </Alert>
    );
  } else {
    const definition = dynamicSecretProviderRegistry.getDefinition(dynamicSecret.type);
    content = definition ? (
      <DynamicSecretProviderForm
        mode="edit"
        definition={definition}
        dynamicSecret={dynamicSecret}
        environment={environment}
        projectSlug={projectSlug}
        secretPath={secretPath}
        onCompleted={close}
        onCancel={requestDiscard}
        onDirtyChange={setIsDirty}
      />
    ) : (
      <Alert variant="danger">
        <AlertDescription>
          The {dynamicSecret.type} provider is not available in the shared provider registry.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && requestDiscard()}>
        <SheetContent className="w-full sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>Edit Dynamic Secret</SheetTitle>
            <SheetDescription>Update dynamic secret parameters.</SheetDescription>
          </SheetHeader>
          {!isPending && content}
          {isPending && <PageLoader />}
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Dynamic Secret Changes?"
        description="Your unsaved changes to this dynamic secret will be lost."
      />
    </>
  );
};
