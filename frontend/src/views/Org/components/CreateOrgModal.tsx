import { FC } from "react";
import { Controller, useForm } from "react-hook-form";
import { useRouter } from "next/router";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalContent } from "@app/components/v2";
import { useCreateOrg, useGetOrganizations, useSelectOrganization } from "@app/hooks/api";

const schema = z
  .object({
    name: z.string().nonempty({ message: "Name is required" })
  })
  .required();

export type FormData = z.infer<typeof schema>;

interface CreateOrgModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateOrgModal: FC<CreateOrgModalProps> = ({ isOpen, onClose }) => {
  const router = useRouter();

  const { refetch: refetchOrganizations } = useGetOrganizations();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: ""
    }
  });

  const { mutateAsync: createOrg } = useCreateOrg({
    invalidate: false
  });
  const { mutateAsync: selectOrg } = useSelectOrganization();

  const onFormSubmit = async ({ name }: FormData) => {
    try {
      const organization = await createOrg({
        name
      });

      await selectOrg({
        organizationId: organization.id,
        forceSetCredentials: true
      });

      await refetchOrganizations();

      createNotification({
        text: "Successfully created organization",
        type: "success"
      });

      if (router.isReady) router.push(`/org/${organization.id}/overview`);
      else window.location.href = `/org/${organization.id}/overview`;

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
          <div className="flex w-full gap-4">
            <Button
              className=""
              size="sm"
              type="submit"
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
            >
              Create
            </Button>
            <Button className="" size="sm" variant="outline_bg" type="button" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
