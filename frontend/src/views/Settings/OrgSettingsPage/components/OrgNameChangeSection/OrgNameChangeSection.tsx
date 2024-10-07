import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, FormControl, Input, Select, SelectItem, Spinner } from "@app/components/v2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission
} from "@app/context";
import { useGetOrgRoles, useUpdateOrg } from "@app/hooks/api";
import { isCustomOrgRole } from "@app/views/Org/MembersPage/components/OrgRoleTabSection/OrgRoleTable";

const formSchema = yup.object({
  name: yup
    .string()
    .required()
    .label("Organization Name")
    .max(64, "Too long, maximum length is 64 characters"),
  slug: yup
    .string()
    .matches(/^[a-zA-Z0-9-]+$/, "Name must only contain alphanumeric characters or hyphens")
    .required()
    .label("Organization Slug"),
  defaultMembershipRole: yup.string().required().label("Default Membership Role")
});

type FormData = yup.InferType<typeof formSchema>;

export const OrgNameChangeSection = (): JSX.Element => {
  const { currentOrg } = useOrganization();
  const { permission } = useOrgPermission();

  const { handleSubmit, control, reset } = useForm<FormData>({
    resolver: yupResolver(formSchema)
  });
  const { mutateAsync, isLoading } = useUpdateOrg();

  const canReadOrgRoles = permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.Role);

  const { data: roles, isLoading: isRolesLoading } = useGetOrgRoles(
    currentOrg?.id!,
    canReadOrgRoles
  );
  const [isFormInitialized, setIsFormInitialized] = useState(false);

  useEffect(() => {
    if (currentOrg) {
      reset({
        name: currentOrg.name,
        slug: currentOrg.slug,
        ...(canReadOrgRoles &&
          roles?.length && {
            // will always be present, can't remove role if default
            defaultMembershipRole: isCustomOrgRole(currentOrg.defaultMembershipRole)
              ? roles?.find((role) => currentOrg.defaultMembershipRole === role.id)?.slug!
              : currentOrg.defaultMembershipRole
          })
      });
      setIsFormInitialized(true);
    }
  }, [currentOrg, roles]);

  const onFormSubmit = async ({ name, slug, defaultMembershipRole }: FormData) => {
    try {
      if (!currentOrg?.id || !roles?.length) return;

      await mutateAsync({
        orgId: currentOrg?.id,
        name,
        slug,
        defaultMembershipRoleSlug: defaultMembershipRole
      });

      createNotification({
        text: "Successfully updated organization details",
        type: "success"
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to update organization details",
        type: "error"
      });
    }
  };

  if (!isFormInitialized) {
    return (
      <div className="flex h-[25.25rem] w-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="py-4">
      <div className="">
        <h2 className="text-md mb-2 text-mineshaft-100">Organization Name</h2>
        <Controller
          defaultValue=""
          render={({ field, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message} className="max-w-md">
              <Input placeholder="Acme Corp" {...field} />
            </FormControl>
          )}
          control={control}
          name="name"
        />
      </div>
      <div className="py-4">
        <h2 className="text-md mb-2 text-mineshaft-100">Organization Slug</h2>
        <Controller
          defaultValue=""
          render={({ field, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message} className="max-w-md">
              <Input placeholder="acme" {...field} />
            </FormControl>
          )}
          control={control}
          name="slug"
        />
      </div>
      {canReadOrgRoles && (
        <div className="pb-4">
          <h2 className="text-md mb-2 text-mineshaft-100">Default Organization Member Role</h2>
          <p className="text-mineshaft-400" />
          <Controller
            defaultValue=""
            control={control}
            name="defaultMembershipRole"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                helperText="Users joining your org will be assigned this role unless otherwise specified"
                isError={Boolean(error)}
                errorText={error?.message}
                className="max-w-md"
              >
                <Select
                  isDisabled={isRolesLoading}
                  className="w-full capitalize"
                  value={value}
                  onValueChange={!roles?.length ? undefined : onChange}
                >
                  {roles?.map((role) => {
                    return (
                      <SelectItem key={role.id} value={role.slug}>
                        {role.name}
                      </SelectItem>
                    );
                  })}
                </Select>
              </FormControl>
            )}
          />
        </div>
      )}
      <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Settings}>
        {(isAllowed) => (
          <Button
            isLoading={isLoading}
            isDisabled={!isAllowed}
            colorSchema="primary"
            variant="outline_bg"
            type="submit"
          >
            Save
          </Button>
        )}
      </OrgPermissionCan>
    </form>
  );
};
