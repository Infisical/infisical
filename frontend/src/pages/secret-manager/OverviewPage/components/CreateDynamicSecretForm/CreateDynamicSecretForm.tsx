import { useCallback, useRef, useState } from "react";

import {
  DynamicSecretProviderForm,
  dynamicSecretProviderRegistry,
  SshDynamicSecretCreateForm
} from "@app/components/dynamic-secrets";
import {
  DiscardChangesAlertDialog,
  DocumentationLinkBadge,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";
import { ProjectEnv } from "@app/hooks/api/types";
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";

import { DynamicSecretProviderSelect } from "./DynamicSecretProviderSelect";

type Props = {
  isOpen?: boolean;
  onToggle: (isOpen: boolean) => void;
  projectSlug: string;
  environments: ProjectEnv[];
  secretPath: string;
  isSingleEnvironmentMode?: boolean;
};

export const CreateDynamicSecretForm = ({
  isOpen,
  onToggle,
  projectSlug,
  environments,
  secretPath,
  isSingleEnvironmentMode
}: Props) => {
  const [selectedProvider, setSelectedProvider] = useState<DynamicSecretProviders>();
  const [isDirty, setIsDirty] = useState(false);
  const discardActionRef = useRef<"back" | "close">("close");
  const definition = selectedProvider
    ? dynamicSecretProviderRegistry.requireDefinition(selectedProvider)
    : undefined;

  const close = useCallback(() => {
    setIsDirty(false);
    setSelectedProvider(undefined);
    onToggle(false);
  }, [onToggle]);
  const handleDiscard = useCallback(() => {
    setIsDirty(false);
    if (discardActionRef.current === "back") {
      setSelectedProvider(undefined);
      return;
    }
    close();
  }, [close]);
  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: handleDiscard });
  const requestClose = () => {
    discardActionRef.current = "close";
    requestDiscard();
  };
  const requestBack = () => {
    discardActionRef.current = "back";
    requestDiscard();
  };

  const header = definition ? (
    <SheetHeader className="-mx-4 -mt-5">
      <SheetTitle className="flex items-center gap-2">
        Add {definition.label} Dynamic Secret
        <DocumentationLinkBadge
          href={`https://infisical.com/docs/documentation/platform/dynamic-secrets/${dynamicSecretProviderRegistry.getDocsSlug(definition.provider)}`}
        />
      </SheetTitle>
      <SheetDescription>Configure dynamic secret parameters.</SheetDescription>
    </SheetHeader>
  ) : undefined;

  let content = (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          Choose a Dynamic Secret Provider
        </SheetTitle>
        <SheetDescription>
          Select the provider whose credentials Infisical should generate.
        </SheetDescription>
      </SheetHeader>
      <DynamicSecretProviderSelect onSelect={setSelectedProvider} />
    </>
  );

  if (definition) {
    content =
      selectedProvider === DynamicSecretProviders.Ssh ? (
        <SshDynamicSecretCreateForm
          header={header}
          onCompleted={close}
          onCancel={requestClose}
          onBack={requestBack}
          onDirtyChange={setIsDirty}
          projectSlug={projectSlug}
          secretPath={secretPath}
          environments={environments}
          isSingleEnvironmentMode={isSingleEnvironmentMode}
        />
      ) : (
        <DynamicSecretProviderForm
          mode="create"
          definition={definition}
          header={header}
          onCompleted={close}
          onCancel={requestClose}
          onBack={requestBack}
          onDirtyChange={setIsDirty}
          projectSlug={projectSlug}
          secretPath={secretPath}
          environments={environments}
          isSingleEnvironmentMode={isSingleEnvironmentMode}
        />
      );
  }

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && requestClose()}>
        <SheetContent className="flex h-full max-h-full w-full flex-col gap-y-0 p-0 sm:w-3/4 sm:max-w-[1500px]">
          {content}
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Dynamic Secret Setup?"
        description="Your progress configuring this dynamic secret will be lost."
      />
    </>
  );
};
