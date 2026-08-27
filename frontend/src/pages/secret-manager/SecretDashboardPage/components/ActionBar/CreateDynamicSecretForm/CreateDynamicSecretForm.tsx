import { useState } from "react";

import {
  DynamicSecretProviderForm,
  dynamicSecretProviderRegistry,
  SshDynamicSecretCreateForm
} from "@app/components/dynamic-secrets";
import {
  Button,
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
  const definition = selectedProvider
    ? dynamicSecretProviderRegistry.requireDefinition(selectedProvider)
    : undefined;

  const close = () => {
    setIsDirty(false);
    setSelectedProvider(undefined);
    onToggle(false);
  };
  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: close });

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
          Add Dynamic Secret
          <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/dynamic-secrets/overview" />
        </SheetTitle>
        <SheetDescription>Select a service to connect to.</SheetDescription>
      </SheetHeader>
      <div className="grid grid-cols-1 gap-2 overflow-y-auto p-4 @md:grid-cols-2">
        {dynamicSecretProviderRegistry.definitions.map((providerDefinition) => (
          <Button
            key={providerDefinition.provider}
            type="button"
            variant="outline"
            className="h-auto justify-start px-4 py-3 text-left"
            onClick={() => setSelectedProvider(providerDefinition.provider)}
          >
            {providerDefinition.label}
          </Button>
        ))}
      </div>
    </>
  );

  if (definition) {
    content =
      selectedProvider === DynamicSecretProviders.Ssh ? (
        <SshDynamicSecretCreateForm
          header={header}
          onCompleted={close}
          onCancel={requestDiscard}
          onBack={requestDiscard}
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
          onCancel={requestDiscard}
          onBack={requestDiscard}
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
      <Sheet open={isOpen} onOpenChange={(open) => !open && requestDiscard()}>
        <SheetContent className="w-full sm:max-w-3xl">{content}</SheetContent>
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
