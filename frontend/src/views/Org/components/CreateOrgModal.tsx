import { FC } from "react";
import { Controller, useForm } from "react-hook-form";
import { useRouter } from "next/router";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { Button, FormControl, Input, Modal, ModalContent } from "@app/components/v2";
import { useCreateOrg } from "@app/hooks/api";

const schema = yup
  .object({
    name: yup.string().required("Organization name is required")
  })
  .required();

export type FormData = yup.InferType<typeof schema>;

interface CreateOrgModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateOrgModal: FC<CreateOrgModalProps> = ({ isOpen, onClose }) => {
  const { createNotification } = useNotificationContext();
  const router = useRouter();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      name: ""
    }
  });

  const { mutateAsync } = useCreateOrg();

  const onFormSubmit = async ({ name }: FormData) => {
    try {
      const organization = await mutateAsync({
        name
      });

      createNotification({
        text: "Successfully created organization",
        type: "success"
      });

      if (router.isReady) router.push(`/org/${organization._id}/overview`);
      else window.location.href = `/org/${organization._id}/overview`;

      localStorage.setItem("orgData.id", organization._id);

      reset();
      onClose();
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to created organization",
        type: "error"
      });
    }
  };

  return (
    <Modal isOpen={isOpen}>
      <ModalContent
        title="Create Organization"
        subTitle="Looks like you're not part of any organizations. Create one to start using Infisical"
      >
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            defaultValue=""
            name="name"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Name" isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} placeholder="Acme Corp" />
              </FormControl>
            )}
          />
          <Button
            className=""
            size="sm"
            type="submit"
            isLoading={isSubmitting}
            isDisabled={isSubmitting}
          >
            Create
          </Button>
        </form>
      </ModalContent>
    </Modal>
  );
};
