import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@app/components/v3";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { useScopeVariant } from "@app/hooks";
import { TAppConnection, useUpdateAppConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { genericAppConnectionFieldsSchema, GenericAppConnectionsFields } from "./AppConnectionForm";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  appConnection?: TAppConnection;
};

const formSchema = genericAppConnectionFieldsSchema.extend({
  app: z.nativeEnum(AppConnection)
});

type FormData = z.infer<typeof formSchema>;

type ContentProps = { appConnection: TAppConnection; onComplete: () => void };

const Content = ({ appConnection, onComplete }: ContentProps) => {
  const updateAppConnection = useUpdateAppConnection();
  const scopeVariant = useScopeVariant();
  const { name: appName } = APP_CONNECTION_MAP[appConnection.app];

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: appConnection.name,
      app: appConnection.app,
      description: appConnection.description
    }
  });

  const {
    handleSubmit,
    formState: { isSubmitting, isDirty }
  } = form;

  const onSubmit = async (formData: FormData) => {
    await updateAppConnection.mutateAsync({
      connectionId: appConnection.id,
      ...formData
    });
    createNotification({
      text: `Successfully updated ${appName} Connection`,
      type: "success"
    });
    onComplete();
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <GenericAppConnectionsFields />
        <div className="mt-8 flex items-center gap-3">
          <Button
            type="submit"
            variant={scopeVariant}
            isPending={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
          >
            Update Details
          </Button>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
        </div>
      </form>
    </FormProvider>
  );
};

export const EditAppConnectionDetailsModal = ({ isOpen, onOpenChange, appConnection }: Props) => {
  if (!appConnection) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Connection Name</DialogTitle>
          <DialogDescription>
            Update the name for this {APP_CONNECTION_MAP[appConnection.app].name} Connection.
          </DialogDescription>
        </DialogHeader>
        <Content appConnection={appConnection} onComplete={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
};
