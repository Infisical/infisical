import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalContent,
  TextArea
} from "@app/components/v2";
import { useNamespace } from "@app/context";
import {
  useCreateNamespaceRole,
  namespaceRolesQueryKeys
} from "@app/hooks/api/namespaceRoles";

import { formRolePermission2API } from "./NamespaceRoleModifySection.utils";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required"),
  description: z.string().optional()
});

type TFormData = z.infer<typeof schema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  roleSlug: string;
};

export const DuplicateNamespaceRoleModal = ({ isOpen, onOpenChange, roleSlug }: Props) => {
  const { namespaceName } = useNamespace();

  const { data: role } = useQuery({
    ...namespaceRolesQueryKeys.detail({ namespaceName, roleSlug }),
    enabled: Boolean(roleSlug) && isOpen
  });

  const { mutateAsync: createRole, isPending: isCreatingRole } = useCreateNamespaceRole();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<TFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      slug: "",
      description: ""
    }
  });

  useEffect(() => {
    if (role && isOpen) {
      reset({
        name: `${role.name} (Copy)`,
        slug: `${role.slug}-copy`,
        description: role.description || ""
      });
    }
  }, [role, isOpen, reset]);

  const onFormSubmit = async (data: TFormData) => {
    try {
      if (!role) return;

      await createRole({
        namespaceName,
        name: data.name,
        slug: data.slug,
        description: data.description,
        permissions: (role.permissions as any[]) || []
      });

      createNotification({
        text: "Successfully duplicated namespace role",
        type: "success"
      });

      onOpenChange(false);
      reset();
    } catch (err: any) {
      console.error(err);
      createNotification({
        text: err?.response?.data?.message || "Failed to duplicate namespace role",
        type: "error"
      });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(isModalOpen) => {
        onOpenChange(isModalOpen);
        if (!isModalOpen) reset();
      }}
    >
      <ModalContent title="Duplicate Namespace Role">
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
            name="description"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Description"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <TextArea {...field} placeholder="Enter role description" />
              </FormControl>
            )}
          />
          <div className="flex items-center justify-end space-x-2">
            <Button
              variant="plain"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              isDisabled={isSubmitting}
              isLoading={isCreatingRole}
            >
              Duplicate Role
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};