import { ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createNotification } from "@app/components/notifications";
import { PkiSyncEditFields } from "@app/components/pki-syncs/types";
import { Button, ModalClose } from "@app/components/v2";
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import { TPkiSync, useUpdatePkiSync } from "@app/hooks/api/pkiSyncs";

import { PkiSyncDestinationFields } from "./PkiSyncDestinationFields";
import { PkiSyncDetailsFields } from "./PkiSyncDetailsFields";
import { PkiSyncOptionsFields } from "./PkiSyncOptionsFields";
import { PkiSyncSourceFields } from "./PkiSyncSourceFields";
import { TPkiSyncForm, UpdatePkiSyncFormSchema } from "./schemas";

type Props = {
  onComplete: (pkiSync: TPkiSync) => void;
  pkiSync: TPkiSync;
  fields: PkiSyncEditFields;
};

export const EditPkiSyncForm = ({ pkiSync, fields, onComplete }: Props) => {
  const updatePkiSync = useUpdatePkiSync();
  const { name: destinationName } = PKI_SYNC_MAP[pkiSync.destination];

  const formMethods = useForm<TPkiSyncForm>({
    resolver: zodResolver(UpdatePkiSyncFormSchema),
    defaultValues: {
      ...pkiSync,
      description: pkiSync.description ?? "",
      connection: {
        id: pkiSync.connectionId,
        name: pkiSync.appConnectionName
      }
    } as Partial<TPkiSyncForm>,
    reValidateMode: "onChange"
  });

  const onSubmit = async ({ connection, ...formData }: TPkiSyncForm) => {
    try {
      const updatedPkiSync = await updatePkiSync.mutateAsync({
        syncId: pkiSync.id,
        ...formData,
        connectionId: connection.id,
        projectId: pkiSync.projectId,
        destination: pkiSync.destination
      });

      createNotification({
        text: `Successfully updated ${destinationName} PKI Sync`,
        type: "success"
      });
      onComplete(updatedPkiSync);
    } catch (err: any) {
      console.error(err);
      createNotification({
        title: `Failed to update ${destinationName} PKI Sync`,
        text: err.message,
        type: "error"
      });
    }
  };

  let Component: ReactNode;

  switch (fields) {
    case PkiSyncEditFields.Destination:
      Component = <PkiSyncDestinationFields />;
      break;
    case PkiSyncEditFields.Options:
      Component = <PkiSyncOptionsFields destination={pkiSync.destination} />;
      break;
    case PkiSyncEditFields.Source:
      Component = <PkiSyncSourceFields />;
      break;
    case PkiSyncEditFields.Details:
    default:
      Component = <PkiSyncDetailsFields />;
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
          Update PKI Sync
        </Button>
      </div>
    </form>
  );
};
