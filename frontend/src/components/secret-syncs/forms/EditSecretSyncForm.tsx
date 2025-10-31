import { ReactNode, useCallback, useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createNotification } from "@app/components/notifications";
import { SecretSyncEditFields } from "@app/components/secret-syncs/types";
import { Button, ModalClose } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import {
  TSecretSync,
  useCheckDuplicateDestination,
  useUpdateSecretSync
} from "@app/hooks/api/secretSyncs";

import { SecretSyncOptionsFields } from "./SecretSyncOptionsFields/SecretSyncOptionsFields";
import { DuplicateDestinationConfirmationModal } from "./DuplicateDestinationConfirmationModal";
import { TSecretSyncForm, UpdateSecretSyncFormSchema } from "./schemas";
import { SecretSyncDestinationFields } from "./SecretSyncDestinationFields";
import { SecretSyncDetailsFields } from "./SecretSyncDetailsFields";
import { SecretSyncSourceFields } from "./SecretSyncSourceFields";

type Props = {
  onComplete: (secretSync: TSecretSync) => void;
  secretSync: TSecretSync;
  fields: SecretSyncEditFields;
};

export const EditSecretSyncForm = ({ secretSync, fields, onComplete }: Props) => {
  const updateSecretSync = useUpdateSecretSync();
  const { name: destinationName } = SECRET_SYNC_MAP[secretSync.destination];
  const [showDuplicateConfirmation, setShowDuplicateConfirmation] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<TSecretSyncForm | null>(null);
  const { currentOrg } = useOrganization();

  const formMethods = useForm<TSecretSyncForm>({
    resolver: zodResolver(UpdateSecretSyncFormSchema),
    defaultValues: {
      ...secretSync,
      environment: secretSync.environment ?? undefined,
      secretPath: secretSync.folder?.path,
      description: secretSync.description ?? ""
    } as Partial<TSecretSyncForm>,
    reValidateMode: "onChange"
  });

  const [destinationConfigToCheck, setDestinationConfigToCheck] = useState<unknown>(null);
  const [checkDuplicateEnabled, setCheckDuplicateEnabled] = useState(false);
  const [storedDuplicateProjectId, setStoredDuplicateProjectId] = useState<string | undefined>();

  const { data: duplicateData, isLoading: isCheckingDuplicate } = useCheckDuplicateDestination(
    secretSync.destination,
    destinationConfigToCheck,
    secretSync.projectId,
    secretSync.id,
    { enabled: checkDuplicateEnabled && Boolean(destinationConfigToCheck) }
  );

  const performUpdate = useCallback(
    async (formData: TSecretSyncForm) => {
      const { environment, connection, ...updateData } = formData;
      const updatedSecretSync = await updateSecretSync.mutateAsync({
        syncId: secretSync.id,
        ...updateData,
        environment: environment?.slug,
        connectionId: connection.id,
        projectId: secretSync.projectId
      });

      createNotification({
        text: `Successfully updated ${destinationName} Sync`,
        type: "success"
      });
      onComplete(updatedSecretSync);
    },
    [updateSecretSync, secretSync.id, secretSync.projectId, destinationName, onComplete]
  );

  useEffect(() => {
    if (checkDuplicateEnabled && !isCheckingDuplicate && destinationConfigToCheck) {
      if (duplicateData?.hasDuplicate) {
        setStoredDuplicateProjectId(duplicateData.duplicateProjectId);
        setShowDuplicateConfirmation(true);
      } else if (pendingFormData) {
        performUpdate(pendingFormData);
        setPendingFormData(null);
      }
      setCheckDuplicateEnabled(false);
      setDestinationConfigToCheck(null);
    }
  }, [
    checkDuplicateEnabled,
    isCheckingDuplicate,
    duplicateData?.hasDuplicate,
    duplicateData?.duplicateProjectId,
    destinationConfigToCheck,
    pendingFormData,
    performUpdate
  ]);

  const normalizeConfig = (config: unknown): unknown => {
    if (config === null || config === undefined || typeof config !== "object") {
      return config;
    }

    if (Array.isArray(config)) {
      return config.map(normalizeConfig);
    }

    const normalized: Record<string, unknown> = {};
    Object.keys(config as Record<string, unknown>)
      .sort()
      .forEach((key) => {
        normalized[key] = normalizeConfig((config as Record<string, unknown>)[key]);
      });

    return normalized;
  };

  const hasDestinationConfigChanged = (formData: TSecretSyncForm) => {
    const originalConfig = normalizeConfig(secretSync.destinationConfig);
    const currentConfig = normalizeConfig(formData.destinationConfig);

    return JSON.stringify(originalConfig) !== JSON.stringify(currentConfig);
  };

  const onSubmit = async (formData: TSecretSyncForm) => {
    if (fields === SecretSyncEditFields.Destination && hasDestinationConfigChanged(formData)) {
      setDestinationConfigToCheck(formData.destinationConfig);
      setPendingFormData(formData);
      setCheckDuplicateEnabled(true);
      return;
    }

    await performUpdate(formData);
  };

  const handleConfirmDuplicate = async () => {
    if (pendingFormData) {
      await performUpdate(pendingFormData);
      setPendingFormData(null);
    }
    setShowDuplicateConfirmation(false);
    setCheckDuplicateEnabled(false);
    setDestinationConfigToCheck(null);
  };

  let Component: ReactNode;

  switch (fields) {
    case SecretSyncEditFields.Destination:
      Component = <SecretSyncDestinationFields />;
      break;
    case SecretSyncEditFields.Options:
      Component = <SecretSyncOptionsFields hideInitialSync={Boolean(secretSync.lastSyncedAt)} />;
      break;
    case SecretSyncEditFields.Source:
      Component = <SecretSyncSourceFields />;
      break;
    case SecretSyncEditFields.Details:
    default:
      Component = <SecretSyncDetailsFields />;
      break;
  }

  const {
    handleSubmit,
    formState: { isSubmitting, isDirty }
  } = formMethods;

  const isLoading = isSubmitting || isCheckingDuplicate;

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)}>
        <FormProvider {...formMethods}>{Component}</FormProvider>
        <div className="flex w-full justify-between gap-4 pt-4">
          <ModalClose asChild>
            <Button colorSchema="secondary" variant="plain">
              Cancel
            </Button>
          </ModalClose>
          <Button
            isLoading={isLoading}
            isDisabled={!isDirty || isLoading}
            type="submit"
            colorSchema="secondary"
          >
            {isCheckingDuplicate ? "Checking..." : "Update Sync"}
          </Button>
        </div>
      </form>

      <DuplicateDestinationConfirmationModal
        isOpen={showDuplicateConfirmation}
        onOpenChange={(open) => {
          setShowDuplicateConfirmation(open);
          if (!open) {
            setStoredDuplicateProjectId(undefined);
          }
        }}
        onConfirm={handleConfirmDuplicate}
        isLoading={updateSecretSync.isPending}
        duplicateProjectId={storedDuplicateProjectId}
        isDisabled={currentOrg?.blockDuplicateSecretSyncDestinations}
      />
    </>
  );
};
