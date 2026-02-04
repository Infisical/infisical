import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, FormControl, Input } from "@app/components/v2";
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
    <form onSubmit={handleSubmit(onFormSubmit)} className="py-4">
      <div className="mb-4">
        <h2 className="text-md mb-2 text-mineshaft-100">Sub-Organization Display Name</h2>
        <Controller
          defaultValue=""
          render={({ field, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message} className="max-w-md">
              <Input
                isDisabled={permission.cannot(
                  OrgPermissionActions.Edit,
                  OrgPermissionSubjects.Settings
                )}
                placeholder="Acme Corp"
                {...field}
              />
            </FormControl>
          )}
          control={control}
          name="name"
        />
      </div>
      <div className="mb-4">
        <h2 className="text-md mb-2 text-mineshaft-100">Sub-Organization Slug</h2>
        <Controller
          defaultValue=""
          render={({ field, fieldState: { error } }) => (
            <FormControl
              isError={Boolean(error)}
              errorText={error?.message}
              helperText="Must be slug-friendly (lowercase letters, numbers, and hyphens only)"
              className="max-w-md"
            >
              <Input
                isDisabled={permission.cannot(
                  OrgPermissionActions.Edit,
                  OrgPermissionSubjects.Settings
                )}
                placeholder="acme-corp"
                {...field}
              />
            </FormControl>
          )}
          control={control}
          name="slug"
        />
      </div>
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
