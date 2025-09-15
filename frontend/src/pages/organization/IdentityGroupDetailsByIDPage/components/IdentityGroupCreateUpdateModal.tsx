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
import { useCreateIdentityGroup, useGetOrgRoles, useUpdateIdentityGroup } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const IdentityGroupFormSchema = z.object({
  name: z.string().min(1, "Name cannot be empty").max(50, "Name must be 50 characters or fewer"),
  slug: z
    .string()
    .min(5, "Slug must be at least 5 characters long")
    .max(36, "Slug must be 36 characters or fewer"),
  role: z.object({ name: z.string(), slug: z.string() })
});

export type TIdentityGroupFormData = z.infer<typeof IdentityGroupFormSchema>;

type Props = {
  popUp: UsePopUpState<["identityGroupCreateUpdate"]>;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["identityGroupCreateUpdate"]>) => void;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["identityGroupCreateUpdate"]>,
    state?: boolean
  ) => void;
};

export const IdentityGroupCreateUpdateModal = ({
  popUp,
  handlePopUpClose,
  handlePopUpToggle
}: Props) => {
  const { currentOrg } = useOrganization();
  const { data: roles } = useGetOrgRoles(currentOrg?.id || "");
  const { mutateAsync: createMutateAsync, isPending: createIsLoading } = useCreateIdentityGroup();
  const { mutateAsync: updateMutateAsync, isPending: updateIsLoading } = useUpdateIdentityGroup();

  const { control, handleSubmit, reset } = useForm<TIdentityGroupFormData>({
    resolver: zodResolver(IdentityGroupFormSchema)
  });

  useEffect(() => {
    const identityGroup = popUp?.identityGroupCreateUpdate?.data as {
      identityGroupId: string;
      name: string;
      slug: string;
      role: string;
      customRole: {
        name: string;
        slug: string;
      };
    };

    if (!roles?.length) return;

    if (identityGroup) {
      reset({
        name: identityGroup.name,
        slug: identityGroup.slug,
        role: identityGroup?.customRole ?? findOrgMembershipRole(roles, identityGroup.role)
      });
    } else {
      reset({
        name: "",
        slug: "",
        role: findOrgMembershipRole(roles, currentOrg!.defaultMembershipRole)
      });
    }
  }, [popUp?.identityGroupCreateUpdate?.data, roles]);

  const onIdentityGroupModalSubmit = async ({ name, slug, role }: TIdentityGroupFormData) => {
    try {
      if (!currentOrg?.id) return;

      const identityGroup = popUp?.identityGroupCreateUpdate?.data as {
        identityGroupId: string;
        name: string;
        slug: string;
      };

      if (identityGroup) {
        await updateMutateAsync({
          id: identityGroup.identityGroupId,
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
      handlePopUpToggle("identityGroupCreateUpdate", false);
      reset();

      createNotification({
        text: `Successfully ${popUp?.identityGroupCreateUpdate?.data ? "updated" : "created"} identity group`,
        type: "success"
      });
    } catch {
      createNotification({
        text: `Failed to ${popUp?.identityGroupCreateUpdate?.data ? "update" : "create"} identity group`,
        type: "error"
      });
    }
  };

  return (
    <Modal
      isOpen={popUp?.identityGroupCreateUpdate?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("identityGroupCreateUpdate", isOpen);
        reset();
      }}
    >
      <ModalContent
        bodyClassName="overflow-visible"
        title={`${popUp?.identityGroupCreateUpdate?.data ? "Update" : "Create"} Identity Group`}
      >
        <form onSubmit={handleSubmit(onIdentityGroupModalSubmit)}>
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Name" errorText={error?.message} isError={Boolean(error)}>
                <Input {...field} placeholder="Engineering Identities" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="slug"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Slug" errorText={error?.message} isError={Boolean(error)}>
                <Input {...field} placeholder="engineering-identities" />
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
              {!popUp?.identityGroupCreateUpdate?.data ? "Create" : "Update"}
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpClose("identityGroupCreateUpdate")}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
