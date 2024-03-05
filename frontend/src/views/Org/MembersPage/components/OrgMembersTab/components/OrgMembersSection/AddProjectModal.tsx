import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { Button, FormControl, Input, Modal, ModalContent } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useAddUserToOrg, useFetchServerStatus } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const addProjectFormSchema = yup.object({
  email: yup.string().email().required().label("Email").trim().lowercase()
});

type TAddProjectForm = yup.InferType<typeof addProjectFormSchema>;

type Props = {
  popUp: UsePopUpState<["addProject"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["addProject"]>, state?: boolean) => void;
};

export const AddProjectModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { createNotification } = useNotificationContext();
  const { currentOrg } = useOrganization();

  const { data: serverDetails } = useFetchServerStatus();
  const { mutateAsync: addUserMutateAsync } = useAddUserToOrg();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<TAddProjectForm>({ resolver: yupResolver(addProjectFormSchema) });

  const onAddProject = async ({ email }: TAddProjectForm) => {
    if (!currentOrg?.id) return;

    try {
      const { data } = await addUserMutateAsync({
        organizationId: currentOrg?.id,
        inviteeEmail: email
      });

      console.log("data", data);
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to invite user to org",
        type: "error"
      });
    }

    if (serverDetails?.emailConfigured) {
      handlePopUpToggle("addProject", false);
    }

    reset();
  };

  const email = popUp.addProject?.data?.email || "";

  return (
    <Modal
      isOpen={popUp?.addProject?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("addProject", isOpen);
      }}
    >
      <ModalContent title={`Add projects to user ${email}`} subTitle={<div>To be completed</div>}>
        <form onSubmit={handleSubmit(onAddProject)}>
          <Controller
            control={control}
            defaultValue=""
            name="email"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Email" isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} />
              </FormControl>
            )}
          />
          <div className="mt-8 flex items-center">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
            >
              Add Project
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpToggle("addProject", false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
