import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, Check, Copy } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  IconButton,
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
import { useTimedReset } from "@app/hooks";
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

const OrganizationIdCopyButton = ({ orgId }: { orgId: string }) => {
  const isWritePending = useRef(false);
  const [isPending, setIsPending] = useState(false);
  const [copyText, isCopied, setCopyText] = useTimedReset<string>({
    initialState: "Copy organization ID"
  });

  return (
    <>
      <IconButton
        type="button"
        variant="ghost"
        size="xs"
        aria-label={isPending ? "Copying organization ID" : copyText}
        isPending={isPending}
        isDisabled={isPending}
        onClick={async () => {
          if (isWritePending.current) return;
          isWritePending.current = true;
          setIsPending(true);
          setCopyText("Copy organization ID");
          try {
            await navigator.clipboard.writeText(orgId);
            setCopyText("Organization ID copied");
          } catch {
            createNotification({
              type: "error",
              text: "Could not copy organization ID. Select and copy it manually."
            });
          } finally {
            isWritePending.current = false;
            setIsPending(false);
          }
        }}
      >
        {isCopied ? <Check /> : <Copy />}
      </IconButton>
      <span className="sr-only" role="status">
        {isCopied ? copyText : ""}
      </span>
    </>
  );
};

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Building2 className="size-4 text-accent" />
          Organization Details
        </CardTitle>
        <CardDescription>
          Update your organization&apos;s name, slug, and default member role.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!isFormInitialized ? (
          <FieldGroup>
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </FieldGroup>
        ) : (
          <form onSubmit={handleSubmit(onFormSubmit)}>
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
                    <OrganizationIdCopyButton key={currentOrg.id} orgId={currentOrg.id} />
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
            <div className="mt-6 flex">
              <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Settings}>
                {(isAllowed) => (
                  <Button variant="org" type="submit" isPending={isPending} isDisabled={!isAllowed}>
                    Save
                  </Button>
                )}
              </OrgPermissionCan>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
};
