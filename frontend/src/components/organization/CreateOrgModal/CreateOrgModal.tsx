import { FC } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import z from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalContent } from "@app/components/v2";
import { useCreateOrg, useSelectOrganization } from "@app/hooks/api";
import { GenericResourceNameSchema } from "@app/lib/schemas";

const schema = z
  .object({
    name: GenericResourceNameSchema.nonempty({ message: "Name is required" })
  })
  .required();

export type FormData = z.infer<typeof schema>;

interface CreateOrgModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateOrgModal: FC<CreateOrgModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();

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
    const organization = await createOrg({
      name
    });

    await selectOrg({
      organizationId: organization.id
    });

    createNotification({
      text: "Successfully created organization",
      type: "success"
    });

    navigate({
      to: "/organizations/$orgId/projects",
      params: { orgId: organization.id }
    });

    localStorage.setItem("orgData.id", organization.id);

    reset();
    onClose();
  };

  return (
    <Modal modal={false} isOpen={isOpen}>
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
