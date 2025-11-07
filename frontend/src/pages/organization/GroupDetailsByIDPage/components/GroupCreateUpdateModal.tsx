import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FilterableSelect,
  FormControl,
  Input,
  Modal,
  ModalContent
} from "@app/components/v2";
import { useOrganization } from "@app/context";
import { findOrgMembershipRole } from "@app/helpers/roles";
import { useCreateGroup, useGetOrgRoles, useUpdateGroup } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const GroupFormSchema = z.object({
  name: z.string().min(1, "Name cannot be empty").max(50, "Name must be 50 characters or fewer"),
  slug: z
    .string()
    .min(5, "Slug must be at least 5 characters long")
    .max(36, "Slug must be 36 characters or fewer"),
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

  return (
    <Modal
      isOpen={popUp?.groupCreateUpdate?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("groupCreateUpdate", isOpen);
        reset();
      }}
    >
      <ModalContent
        bodyClassName="overflow-visible"
        title={`${popUp?.groupCreateUpdate?.data ? "Update" : "Create"} Group`}
      >
        <form onSubmit={handleSubmit(onGroupModalSubmit)}>
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Name" errorText={error?.message} isError={Boolean(error)}>
                <Input {...field} placeholder="Engineering" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="slug"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Slug" errorText={error?.message} isError={Boolean(error)}>
                <Input {...field} placeholder="engineering" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="role"
            render={({ field: { onChange, value }, fieldState: { error } }) => (
              <FormControl
                label="Role"
                errorText={error?.message}
                isError={Boolean(error)}
                className="mt-4"
              >
                <FilterableSelect
                  options={roles}
                  placeholder="Select role..."
                  onChange={onChange}
                  value={value}
                  getOptionValue={(option) => option.slug}
                  getOptionLabel={(option) => option.name}
                />
              </FormControl>
            )}
          />
          <div className="mt-8 flex items-center">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              isLoading={createIsLoading || updateIsLoading}
            >
              {!popUp?.groupCreateUpdate?.data ? "Create" : "Update"}
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpClose("groupCreateUpdate")}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
