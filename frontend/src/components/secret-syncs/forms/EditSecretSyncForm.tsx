import { ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createNotification } from "@app/components/notifications";
import { SecretSyncEditFields } from "@app/components/secret-syncs/types";
import { Button, ModalClose } from "@app/components/v2";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { TSecretSync, useUpdateSecretSync } from "@app/hooks/api/secretSyncs";

import { SecretSyncOptionsFields } from "./SecretSyncOptionsFields/SecretSyncOptionsFields";
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

  const formMethods = useForm<TSecretSyncForm>({
    resolver: zodResolver(UpdateSecretSyncFormSchema),
    defaultValues: {
      ...secretSync,
      environment: secretSync.environment ?? undefined,
      secretPath: secretSync.folder?.path,
      description: secretSync.description ?? ""
    },
    reValidateMode: "onChange"
  });

  const onSubmit = async ({ environment, connection, ...formData }: TSecretSyncForm) => {
    try {
      const updatedSecretSync = await updateSecretSync.mutateAsync({
        syncId: secretSync.id,
        ...formData,
        environment: environment?.slug,
        connectionId: connection.id,
        projectId: secretSync.projectId
      });

      createNotification({
        text: `Successfully updated ${destinationName} Sync`,
        type: "success"
      });
      onComplete(updatedSecretSync);
    } catch (err: any) {
      console.error(err);
      createNotification({
        title: `Failed to update ${destinationName} Sync`,
        text: err.message,
        type: "error"
      });
    }
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

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormProvider {...formMethods}>{Component}</FormProvider>
      <div className="flex w-full justify-between gap-4 pt-4">
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            Cancel
          </Button>
        </ModalClose>
        <Button
          isLoading={isSubmitting}
          isDisabled={!isDirty || isSubmitting}
          type="submit"
          colorSchema="secondary"
        >
          Update Sync
        </Button>
      </div>
    </form>
  );
};
