import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
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

  const { handleSubmit, control, reset } = useForm<FormData>({
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
    <Card>
      <CardHeader>
        <CardTitle>
          <Building2 className="size-4 text-accent" />
          Sub-Organization Details
        </CardTitle>
        <CardDescription>
          Update your sub-organization&apos;s display name and slug.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onFormSubmit)}>
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
          <div className="mt-6 flex justify-end">
            <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Settings}>
              {(isAllowed) => (
                <Button variant="org" type="submit" isPending={isPending} isDisabled={!isAllowed}>
                  Save
                </Button>
              )}
            </OrgPermissionCan>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
