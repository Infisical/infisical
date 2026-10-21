import { type JSX, useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
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
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input
} from "@app/components/v3";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission
} from "@app/context";
import { useUpdateSubOrganization } from "@app/hooks/api";
import { GenericResourceNameSchema, slugSchema } from "@app/lib/schemas";

const formSchema = z.object({
  name: GenericResourceNameSchema,
  slug: slugSchema()
});

type FormData = z.infer<typeof formSchema>;

export const SubOrgNameChangeSection = (): JSX.Element => {
  const { currentOrg } = useOrganization();
  const { permission } = useOrgPermission();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    handleSubmit,
    control,
    reset,
    formState: { isDirty }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: currentOrg?.name || "",
      slug: currentOrg?.slug || ""
    }
  });

  useEffect(() => {
    if (currentOrg) {
      reset({
        name: currentOrg.name || "",
        slug: currentOrg.slug || ""
      });
    }
  }, [currentOrg?.id, currentOrg?.name, currentOrg?.slug, reset]);

  const { mutateAsync, isPending } = useUpdateSubOrganization();

  const cannotEdit = permission.cannot(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);

  const onFormSubmit = async ({ name, slug }: FormData) => {
    await mutateAsync({
      name,
      slug,
      subOrgId: currentOrg.id
    });

    navigate({
      to: "/organizations/$orgId/settings",
      params: { orgId: currentOrg.id },
      search: { subOrganization: slug }
    });
    queryClient.invalidateQueries();
    await router.invalidate({ sync: true });
    createNotification({
      text: "Successfully updated sub-organization details",
      type: "success"
    });
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Card className="gap-0 overflow-hidden p-0">
        <CardHeader className="p-6">
          <CardTitle>Sub-Organization Details</CardTitle>
          <CardDescription>
            Update your sub-organization&apos;s display name and slug.
          </CardDescription>
        </CardHeader>
        <CardContent className="max-w-md px-6 pb-6">
          <FieldGroup>
            <Controller
              defaultValue=""
              control={control}
              name="name"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="sub-org-name">Sub-Organization Display Name</FieldLabel>
                  <Input
                    id="sub-org-name"
                    placeholder="Acme Corp"
                    isError={Boolean(error)}
                    disabled={cannotEdit}
                    {...field}
                    autoComplete="off"
                    name="sub-org-name"
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <Field>
              <FieldLabel htmlFor="sub-org-id">Sub-Organization ID</FieldLabel>
              <Input id="sub-org-id" value={currentOrg.id} disabled />
            </Field>
            <Controller
              defaultValue=""
              control={control}
              name="slug"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="sub-org-slug">Sub-Organization Slug</FieldLabel>
                  <Input
                    id="sub-org-slug"
                    placeholder="acme-corp"
                    isError={Boolean(error)}
                    disabled={cannotEdit}
                    {...field}
                  />
                  <FieldDescription>
                    Must be slug-friendly (lowercase letters, numbers, and hyphens only).
                  </FieldDescription>
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
          </FieldGroup>
        </CardContent>
        <CardFooter className="min-h-8 justify-end border-t border-neutral/15 bg-neutral/5 p-4">
          <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Settings}>
            {(isAllowed) => (
              <Button
                variant="sub-org"
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
