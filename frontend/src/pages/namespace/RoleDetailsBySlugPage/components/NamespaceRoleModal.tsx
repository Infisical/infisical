import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalContent } from "@app/components/v2";
import { useNamespace } from "@app/context";
import {
  namespaceRolesQueryKeys,
  useCreateNamespaceRole,
  useUpdateNamespaceRole
} from "@app/hooks/api/namespaceRoles";
import { UsePopUpState } from "@app/hooks/usePopUp";

import {
  formRolePermission2API,
  formSchema,
  rolePermission2Form,
  TFormSchema
} from "./NamespaceRoleModifySection.utils";

type Props = {
  popUp: UsePopUpState<["role"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["role"]>, state?: boolean) => void;
};

export const NamespaceRoleModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { namespaceId } = useNamespace();
  const navigate = useNavigate();
  const isOpen = popUp?.role?.isOpen;
  const roleSlug = (popUp?.role?.data as { roleSlug?: string })?.roleSlug;

  const { data: role } = useQuery({
    ...namespaceRolesQueryKeys.detail({ namespaceId, roleSlug: roleSlug! }),
    enabled: Boolean(roleSlug)
  });

  const { mutateAsync: createRole } = useCreateNamespaceRole();
  const { mutateAsync: updateRole } = useUpdateNamespaceRole();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<TFormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      permissions: {}
    }
  });

  useEffect(() => {
    if (role) {
      reset({
        name: role.name,
        slug: role.slug,
        description: role.description || "",
        permissions: rolePermission2Form((role.permissions as any[]) || [])
      });
    } else {
      reset({
        name: "",
        slug: "",
        description: "",
        permissions: {}
      });
    }
  }, [role, reset]);

  const onFormSubmit = async (data: TFormSchema) => {
    try {
      const permissions = formRolePermission2API(data.permissions);

      if (roleSlug) {
        if (!role?.id) return;

        await updateRole({
          namespaceId,
          roleId: role.id,
          name: data.name,
          slug: data.slug,
          description: data.description,
          permissions
        });

        createNotification({
          text: "Successfully updated namespace role",
          type: "success"
        });
      } else {
        await createRole({
          namespaceId,
          name: data.name,
          slug: data.slug,
          description: data.description,
          permissions
        });

        createNotification({
          text: "Successfully created namespace role",
          type: "success"
        });

        navigate({
          to: "/organization/namespaces/$namespaceId/roles/$roleSlug",
          params: {
            namespaceId,
            roleSlug: data.slug
          }
        });
      }

      handlePopUpToggle("role", false);
      reset();
    } catch (err: any) {
      console.error(err);
      createNotification({
        text:
          err?.response?.data?.message ||
          `Failed to ${roleSlug ? "update" : "create"} namespace role`,
        type: "error"
      });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(isModalOpen) => {
        handlePopUpToggle("role", isModalOpen);
        if (!isModalOpen) reset();
      }}
    >
      <ModalContent title={`${roleSlug ? "Update" : "Create"} Namespace Role`}>
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Name"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder="Enter role name" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="slug"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Slug"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder="Enter role slug" />
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
