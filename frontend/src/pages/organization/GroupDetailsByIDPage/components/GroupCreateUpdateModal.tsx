import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { RoleOption } from "@app/components/roles";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Input
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { findOrgMembershipRole } from "@app/helpers/roles";
import { useCreateGroup, useGetOrgRoles, useUpdateGroup } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const GroupFormSchema = z.object({
  name: z.string().min(1, "Name cannot be empty").max(255, "Name must be 255 characters or fewer"),
  slug: z
    .string()
    .min(5, "Slug must be at least 5 characters long")
    .max(255, "Slug must be 255 characters or fewer")
    .regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens"),
  role: z.object({ name: z.string(), slug: z.string() })
});

export type TGroupFormData = z.infer<typeof GroupFormSchema>;

type Props = {
  popUp: UsePopUpState<["groupCreateUpdate"]>;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["groupCreateUpdate"]>) => void;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["groupCreateUpdate"]>,
    state?: boolean
  ) => void;
};

export const GroupCreateUpdateModal = ({ popUp, handlePopUpClose, handlePopUpToggle }: Props) => {
  const { currentOrg } = useOrganization();
  const { data: roles } = useGetOrgRoles(currentOrg?.id || "");
  const { mutateAsync: createMutateAsync, isPending: createIsLoading } = useCreateGroup();
  const { mutateAsync: updateMutateAsync, isPending: updateIsLoading } = useUpdateGroup();

  const { control, handleSubmit, reset } = useForm<TGroupFormData>({
    resolver: zodResolver(GroupFormSchema)
  });

  useEffect(() => {
    const group = popUp?.groupCreateUpdate?.data as {
      groupId: string;
      name: string;
      slug: string;
      role: string;
      customRole: {
        name: string;
        slug: string;
      };
    };

    if (!roles?.length) return;

    if (group) {
      reset({
        name: group.name,
        slug: group.slug,
        role: group?.customRole ?? findOrgMembershipRole(roles, group.role)
      });
    } else {
      reset({
        name: "",
        slug: "",
        role: findOrgMembershipRole(roles, currentOrg!.defaultMembershipRole)
      });
    }
  }, [popUp?.groupCreateUpdate?.data, roles]);

  const onGroupModalSubmit = async ({ name, slug, role }: TGroupFormData) => {
    if (!currentOrg?.id) return;

    const group = popUp?.groupCreateUpdate?.data as {
      groupId: string;
      name: string;
      slug: string;
    };

    if (group) {
      await updateMutateAsync({
        id: group.groupId,
        name,
        slug,
        role: role.slug || undefined
      });
    } else {
      await createMutateAsync({
        name,
        slug,
        organizationId: currentOrg.id,
        role: role.slug || undefined
      });
    }
    handlePopUpToggle("groupCreateUpdate", false);
    reset();

    createNotification({
      text: `Successfully ${popUp?.groupCreateUpdate?.data ? "updated" : "created"} group`,
      type: "success"
    });
  };

  const isCreateMode = !popUp?.groupCreateUpdate?.data;

  return (
    <Dialog
      open={popUp?.groupCreateUpdate?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("groupCreateUpdate", isOpen);
        if (!isOpen) reset();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isCreateMode ? "Create Group" : "Update Group"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onGroupModalSubmit)} className="flex flex-col gap-4">
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input id="name" placeholder="Engineering" isError={Boolean(error)} {...field} />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="slug"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="slug">Slug</FieldLabel>
                <Input id="slug" placeholder="engineering" isError={Boolean(error)} {...field} />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="role"
            render={({ field: { onChange, value }, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="role">Role</FieldLabel>
                <FilterableSelect
                  inputId="role"
                  options={roles}
                  placeholder="Select role..."
                  onChange={onChange}
                  value={value}
                  isError={Boolean(error)}
                  getOptionValue={(option) => option.slug}
                  getOptionLabel={(option) => option.name}
                  components={{ Option: RoleOption }}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <DialogFooter>
            <Button
              variant="ghost"
              type="button"
              onClick={() => handlePopUpClose("groupCreateUpdate")}
            >
              Cancel
            </Button>
            <Button
              variant="org"
              type="submit"
              isPending={createIsLoading || updateIsLoading}
              isDisabled={createIsLoading || updateIsLoading}
            >
              {isCreateMode ? "Create" : "Update"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
