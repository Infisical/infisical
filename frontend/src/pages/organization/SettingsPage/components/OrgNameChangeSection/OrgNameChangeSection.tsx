import { type JSX, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  CopyButton,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton
} from "@app/components/v3";
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

  const {
    handleSubmit,
    control,
    reset,
    formState: { isDirty }
  } = useForm<FormData>({
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
    reset({ name, slug, defaultMembershipRole }, { keepDirtyValues: true });
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Card className="gap-0 overflow-hidden p-0">
        <CardHeader className="p-6">
          <CardTitle>Organization Details</CardTitle>
          <CardDescription>
            Update your organization&apos;s name, slug, and default member role.
          </CardDescription>
        </CardHeader>
        <CardContent className="max-w-md px-6 pb-6">
          {!isFormInitialized ? (
            <FieldGroup>
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </FieldGroup>
          ) : (
            <FieldGroup>
              <Controller
                defaultValue=""
                control={control}
                name="name"
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel htmlFor="org-name">Organization Name</FieldLabel>
                    <Input
                      id="org-name"
                      placeholder="Acme Corp"
                      isError={Boolean(error)}
                      {...field}
                      autoComplete="off"
                      name="org-name"
                    />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
              <Field>
                <FieldLabel htmlFor="org-id">Organization ID</FieldLabel>
                <InputGroup>
                  <InputGroupInput id="org-id" value={currentOrg.id} readOnly />
                  <InputGroupAddon align="inline-end">
                    <CopyButton
                      key={currentOrg.id}
                      type="button"
                      value={currentOrg.id}
                      ariaLabel="Copy organization ID"
                    />
                  </InputGroupAddon>
                </InputGroup>
              </Field>
              <Controller
                defaultValue=""
                control={control}
                name="slug"
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel htmlFor="org-slug">Organization Slug</FieldLabel>
                    <Input id="org-slug" placeholder="acme" isError={Boolean(error)} {...field} />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
              {canReadOrgRoles && (
                <Controller
                  defaultValue=""
                  control={control}
                  name="defaultMembershipRole"
                  render={({ field: { value, onChange }, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="org-default-role">
                        Default Organization Member Role
                      </FieldLabel>
                      <Select
                        value={value}
                        onValueChange={!roles?.length ? undefined : onChange}
                        disabled={isRolesLoading}
                      >
                        <SelectTrigger
                          id="org-default-role"
                          isError={Boolean(error)}
                          className="w-full capitalize"
                        >
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          {roles?.map((role) => (
                            <SelectItem key={role.id} value={role.slug} className="capitalize">
                              {role.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldDescription>
                        Users joining your organization will be assigned this role unless otherwise
                        specified.
                      </FieldDescription>
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
              )}
            </FieldGroup>
          )}
        </CardContent>
        <CardFooter className="min-h-8 justify-end border-t border-neutral/15 bg-neutral/5 p-4">
          <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Settings}>
            {(isAllowed) => (
              <Button
                variant="org"
                size="sm"
                type="submit"
                isPending={isPending}
                isDisabled={!isAllowed || !isDirty}
              >
                Save Changes
              </Button>
            )}
          </OrgPermissionCan>
        </CardFooter>
      </Card>
    </form>
  );
};
