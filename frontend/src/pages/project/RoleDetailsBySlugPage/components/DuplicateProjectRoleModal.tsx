import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalContent, Spinner } from "@app/components/v2";
import { ProjectPermissionSub, useOrganization, useProject } from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { getProjectBaseURL } from "@app/helpers/project";
import { useCreateProjectRole, useGetProjectRoleBySlug } from "@app/hooks/api";
import { TProjectRole } from "@app/hooks/api/roles/types";
import { slugSchema } from "@app/lib/schemas";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  roleSlug?: string;
};

const schema = z
  .object({
    name: z.string().min(1, "Name required"),
    description: z.string(),
    slug: slugSchema({ min: 1 })
  })
  .required();

export type FormData = z.infer<typeof schema>;

type ContentProps = {
  role: TProjectRole;
  onClose: () => void;
};

const Content = ({ role, onClose }: ContentProps) => {
  const {
    control,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<FormData>({
    defaultValues: {
      name: `${role.name} Duplicate`
    },
    resolver: zodResolver(schema)
  });

  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const createRole = useCreateProjectRole();
  const navigate = useNavigate();

  const handleDuplicateRole = async (form: FormData) => {
    const sanitizedPermission = role.permissions.map((permission) => {
      if (
        // if contains new secret action the legacy one can be stripped off
        // mainly done for duplicating predefined roles
        permission.subject === ProjectPermissionSub.Secrets &&
        (permission.action.includes(ProjectPermissionSecretActions.DescribeSecret) ||
          permission.action.includes(ProjectPermissionSecretActions.ReadValue))
      ) {
        return {
          ...permission,
          action: (permission.action as string[])?.filter(
            (action) => action !== ProjectPermissionSecretActions.DescribeAndReadValue
          )
        };
      }
      return permission;
    });

    const newRole = await createRole.mutateAsync({
      projectId: currentProject.id,
      permissions: sanitizedPermission,
      ...form
    });

    createNotification({
      type: "success",
      text: "Role duplicated successfully"
    });

    navigate({
      to: `${getProjectBaseURL(currentProject.type)}/roles/$roleSlug` as const,
      params: {
        orgId: currentOrg.id,
        roleSlug: newRole.slug,
        projectId: currentProject.id
      }
    });

    onClose();
  };

  return (
    <form onSubmit={handleSubmit(handleDuplicateRole)}>
      <Controller
        control={control}
        defaultValue=""
        name="name"
        render={({ field, fieldState: { error } }) => (
          <FormControl label="Name" isError={Boolean(error)} errorText={error?.message} isRequired>
            <Input {...field} placeholder="Billing Team" />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        defaultValue=""
        name="slug"
        render={({ field, fieldState: { error } }) => (
          <FormControl label="Slug" isError={Boolean(error)} errorText={error?.message} isRequired>
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
          Duplicate Role
        </Button>
        <Button colorSchema="secondary" variant="plain" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
};

export const DuplicateProjectRoleModal = ({ isOpen, onOpenChange, roleSlug }: Props) => {
  const { currentProject } = useProject();

  const { data: role, isPending } = useGetProjectRoleBySlug(currentProject.id, roleSlug ?? "");

  if (!roleSlug) return null;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Duplicate Role"
        subTitle="Duplicate this role to create a new role with the same permissions."
      >
        {/* eslint-disable-next-line no-nested-ternary */}
        {isPending ? (
          <div className="flex h-full flex-col items-center justify-center py-2.5">
            <Spinner size="lg" className="text-mineshaft-500" />
            <p className="mt-4 text-sm text-mineshaft-400">Loading Role...</p>
          </div>
        ) : role ? (
          <Content role={role!} onClose={() => onOpenChange(false)} />
        ) : (
          <p className="w-full text-center text-red">
            Error: could not find role with slug &#34;{roleSlug}&#34;
          </p>
        )}
      </ModalContent>
    </Modal>
  );
};
