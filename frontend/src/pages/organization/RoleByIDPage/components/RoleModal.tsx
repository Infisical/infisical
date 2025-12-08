import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalContent } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useCreateOrgRole, useGetOrgRole, useUpdateOrgRole } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { slugSchema } from "@app/lib/schemas";

const schema = z
  .object({
    name: z.string().min(1, "Name required"),
    description: z.string(),
    slug: slugSchema({ min: 1 })
  })
  .required();

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["role"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["role"]>, state?: boolean) => void;
};

export const RoleModal = ({ popUp, handlePopUpToggle }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";

  const popupData = popUp?.role?.data as {
    roleId: string;
  };

  const { data: role } = useGetOrgRole(orgId, popupData?.roleId ?? "");

  const { mutateAsync: createOrgRole } = useCreateOrgRole();
  const { mutateAsync: updateOrgRole } = useUpdateOrgRole();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      description: ""
    }
  });

  useEffect(() => {
    if (role) {
      reset({
        name: role.name,
        description: role.description,
        slug: role.slug
      });
    } else {
      reset({
        name: "",
        description: "",
        slug: ""
      });
    }
  }, [role]);

  const onFormSubmit = async ({ name, description, slug }: FormData) => {
    if (!orgId) return;

    if (role) {
      // update

      await updateOrgRole({
        orgId,
        id: role.id,
        name,
        description,
        slug
      });

      handlePopUpToggle("role", false);
    } else {
      // create

      const newRole = await createOrgRole({
        orgId,
        name,
        description,
        slug,
        permissions: []
      });

      handlePopUpToggle("role", false);
      navigate({
        to: "/organizations/$orgId/roles/$roleId" as const,
        params: {
          orgId,
          roleId: newRole.id
        }
      });
    }

    createNotification({
      text: `Successfully ${popUp?.role?.data ? "updated" : "created"} role`,
      type: "success"
    });

    reset();
  };

  return (
    <Modal
      isOpen={popUp?.role?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("role", isOpen);
        reset();
      }}
    >
      <ModalContent title={`${popUp?.role?.data ? "Update" : "Create"} Role`}>
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            defaultValue=""
            name="name"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Name"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder="Billing Team" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue=""
            name="slug"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Slug"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder="billing" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue=""
            name="description"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Description" isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} placeholder="To manage billing" />
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
              {popUp?.role?.data ? "Update" : "Create"}
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpToggle("role", false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
