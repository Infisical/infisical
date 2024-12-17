import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalClose, ModalContent } from "@app/components/v2";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { TAppConnection, useUpdateAppConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { slugSchema } from "@app/lib/schemas";
import { DiscriminativePick } from "@app/lib/types";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  appConnection?: TAppConnection;
};

const formSchema = z.object({
  name: slugSchema({ min: 1, max: 32, field: "Name" }),
  app: z.nativeEnum(AppConnection)
});

type FormData = z.infer<typeof formSchema>;

type ContentProps = { appConnection: TAppConnection; onComplete: () => void };

const Content = ({ appConnection, onComplete }: ContentProps) => {
  const updateAppConnection = useUpdateAppConnection();
  const { name: appName } = APP_CONNECTION_MAP[appConnection.app];

  const {
    handleSubmit,
    register,
    formState: { isSubmitting, errors, isDirty }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: appConnection.name, app: appConnection.app }
  });

  const onSubmit = async (formData: DiscriminativePick<TAppConnection, "name" | "app">) => {
    try {
      await updateAppConnection.mutateAsync({
        connectionId: appConnection.id,
        ...formData
      });
      createNotification({
        text: `Successfully updated ${appName} Connection`,
        type: "success"
      });
      onComplete();
    } catch (err: any) {
      console.error(err);
      createNotification({
        title: `Failed to update ${appName} Connection`,
        text: err.message,
        type: "error"
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormControl
        helperText="Name must be slug-friendly"
        errorText={errors.name?.message}
        isError={Boolean(errors.name?.message)}
        label="Name"
      >
        <Input autoFocus placeholder={`my-${AppConnection.AWS}-connection`} {...register("name")} />
      </FormControl>

      <div className="mt-8 flex items-center">
        <Button
          className="mr-4"
          size="sm"
          type="submit"
          colorSchema="secondary"
          isLoading={isSubmitting}
          isDisabled={isSubmitting || !isDirty}
        >
          Update Name
        </Button>
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            Cancel
          </Button>
        </ModalClose>
      </div>
    </form>
  );
};

export const EditAppConnectionNameModal = ({ isOpen, onOpenChange, appConnection }: Props) => {
  if (!appConnection) return null;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-2xl"
        title="Edit Connection Name"
        subTitle={`Update the name for this ${
          appConnection ? APP_CONNECTION_MAP[appConnection.app].name : "App"
        } Connection.`}
      >
        <Content appConnection={appConnection} onComplete={() => onOpenChange(false)} />
      </ModalContent>
    </Modal>
  );
};
