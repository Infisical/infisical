import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, FormControl, Input, Select, SelectItem, Spinner } from "@app/components/v2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission
} from "@app/context";
import { isCustomOrgRole } from "@app/helpers/roles";
import { useGetOrgRoles, useUpdateOrg } from "@app/hooks/api";
import { GenericResourceNameSchema } from "@app/lib/schemas";

const formSchema = z.object({
  name: GenericResourceNameSchema,
  slug: z
    .string()
    .regex(/^[a-zA-Z0-9-]+$/, "Name must only contain alphanumeric characters or hyphens"),
  defaultMembershipRole: z.string()
});

type FormData = z.infer<typeof formSchema>;

export const OrgNameChangeSection = (): JSX.Element => {
  const { currentOrg } = useOrganization();
  const { permission } = useOrgPermission();

  const { handleSubmit, control, reset } = useForm<FormData>({
    resolver: zodResolver(formSchema)
  });
  const { mutateAsync, isPending } = useUpdateOrg();

  const canReadOrgRoles = permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.Role);

  const { data: roles, isPending: isRolesLoading } = useGetOrgRoles(currentOrg.id, canReadOrgRoles);
  const [isFormInitialized, setIsFormInitialized] = useState(false);

  useEffect(() => {
    reset({
      name: currentOrg.name,
      slug: currentOrg.slug,
      ...(canReadOrgRoles &&
        roles?.length && {
          // will always be present, can't remove role if default
          defaultMembershipRole: isCustomOrgRole(currentOrg.defaultMembershipRole)
            ? roles?.find((role) => currentOrg.defaultMembershipRole === role.id)?.slug || ""
            : currentOrg.defaultMembershipRole
        })
    });
    setIsFormInitialized(true);
  }, [roles]);

  const onFormSubmit = async ({ name, slug, defaultMembershipRole }: FormData) => {
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
  };

  if (!isFormInitialized) {
    return (
      <div className="flex h-101 w-full items-center justify-center">
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
      <div>
        <h2 className="text-md mb-2 text-mineshaft-100">Organization ID</h2>
        <FormControl className="max-w-md">
          <Input isDisabled value={currentOrg.id} />
        </FormControl>
      </div>
      <div>
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
                helperText="Users joining your organization will be assigned this role unless otherwise specified."
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
            isLoading={isPending}
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
