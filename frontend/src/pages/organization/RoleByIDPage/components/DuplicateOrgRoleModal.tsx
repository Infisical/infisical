import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalContent, Spinner } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useCreateOrgRole, useGetOrgRole } from "@app/hooks/api";
import { TOrgRole } from "@app/hooks/api/roles/types";
import { slugSchema } from "@app/lib/schemas";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  roleId?: string;
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
  role: TOrgRole;
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

  const createRole = useCreateOrgRole();
  const navigate = useNavigate();

  const handleDuplicateRole = async (form: FormData) => {
    const newRole = await createRole.mutateAsync({
      orgId: role.orgId,
      permissions: role.permissions,
      ...form
    });

    createNotification({
      type: "success",
      text: "Role duplicated successfully"
    });

    navigate({
      to: "/organizations/$orgId/roles/$roleId" as const,
      params: {
        orgId: role.orgId,
        roleId: newRole.id
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

export const DuplicateOrgRoleModal = ({ isOpen, onOpenChange, roleId }: Props) => {
  const { currentOrg } = useOrganization();

  const { data: role, isPending } = useGetOrgRole(currentOrg.id, roleId ?? "");

  if (!roleId) return null;

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
            Error: could not find role with slug &#34;{roleId}&#34;
          </p>
        )}
      </ModalContent>
    </Modal>
  );
};
