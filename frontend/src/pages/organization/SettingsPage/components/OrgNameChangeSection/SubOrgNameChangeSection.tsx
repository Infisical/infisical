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

const formSchema = z.object({
  name: z
    .string()
    .regex(/^[a-zA-Z0-9-]+$/, "Name must only contain alphanumeric characters or hyphens")
});

type FormData = z.infer<typeof formSchema>;

export const SubOrgNameChangeSection = (): JSX.Element => {
  const { currentOrg } = useOrganization();
  const { permission } = useOrgPermission();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { handleSubmit, control } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: currentOrg?.subOrganization?.name || ""
    }
  });
  const { mutateAsync, isPending } = useUpdateSubOrganization();

  const onFormSubmit = async ({ name }: FormData) => {
    await mutateAsync({
      name,
      subOrgId: currentOrg.id
    });

    navigate({
      to: "/organizations/$orgId/settings",
      params: { orgId: currentOrg.id },
      search: { subOrganization: name }
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
      <div>
        <h2 className="text-md mb-2 text-mineshaft-100">Organization Name</h2>
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
