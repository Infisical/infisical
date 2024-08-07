import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalContent } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useCreateAlert, useGetAlertById,useUpdateAlert } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z.object({
  name: z.string().trim().min(1)
});

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["alert"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["alert"]>, state?: boolean) => void;
};

export const AlertModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace?.id || "";

  const { data: alert } = useGetAlertById(
    (popUp?.alert?.data as { alertId: string })?.alertId || ""
  );

  const { mutateAsync: createAlert } = useCreateAlert();
  const { mutateAsync: updateAlert } = useUpdateAlert();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  useEffect(() => {
    if (alert) {
      reset({
        name: alert.name
      });
    } else {
      reset({
        name: ""
      });
    }
  }, [alert]);

  const onFormSubmit = async ({ name }: FormData) => {
    try {
      if (!projectId) return;

      if (alert) {
        // update
        await updateAlert({
          alertId: alert.id,
          name,
          projectId,
          alertBeforeDays: 3,
          emails: ["test"]
        });
      } else {
        // create
        await createAlert({
          name,
          projectId,
          alertBeforeDays: 3,
          emails: ["test"]
        });
      }

      handlePopUpToggle("alert", false);

      reset();

      createNotification({
        text: `Successfully ${alert ? "updated" : "created"} alert`,
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: `Failed to ${alert ? "updated" : "created"} alert`,
        type: "error"
      });
    }
  };

  return (
    <Modal
      isOpen={popUp?.alert?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("alert", isOpen);
        reset();
      }}
    >
      <ModalContent title={`${alert ? "Edit" : "Create"} Alert`}>
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            defaultValue=""
            name="name"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Name" isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} placeholder="My Alert" />
              </FormControl>
            )}
          />
          <div className="flex items-center">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
            >
              Create
            </Button>
            <Button colorSchema="secondary" variant="plain">
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
