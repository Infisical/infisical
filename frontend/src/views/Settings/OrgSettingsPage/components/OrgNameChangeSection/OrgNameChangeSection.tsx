import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, FormControl, Input } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useUpdateOrg } from "@app/hooks/api";

const formSchema = yup.object({
  name: yup.string().required().label("Organization Name").max(64, "Too long, maximum length is 64 characters"),
  slug: yup
      .string()
      .matches(/^[a-zA-Z0-9-]+$/, "Name must only contain alphanumeric characters or hyphens")
      .required()
      .label("Organization Slug")
});

type FormData = yup.InferType<typeof formSchema>;

export const OrgNameChangeSection = (): JSX.Element => {
  const { currentOrg } = useOrganization();
  const { createNotification } = useNotificationContext();
  const { handleSubmit, control, reset } = useForm<FormData>({
    resolver: yupResolver(formSchema)
  });
  const { mutateAsync, isLoading } = useUpdateOrg();

  useEffect(() => {
    if (currentOrg) {
      reset({ 
        name: currentOrg.name,
        slug: currentOrg.slug
      });
    }
  }, [currentOrg]);

  const onFormSubmit = async ({ name, slug }: FormData) => {
    try {
      if (!currentOrg?.id) return;

      await mutateAsync({ 
        orgId: currentOrg?.id, 
        name,
        slug
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

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="py-4">
      <div>
        <h2 className="mb-2 text-md text-mineshaft-100">Organization Name</h2>
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
        <h2 className="mb-2 text-md text-mineshaft-100">Organization Slug</h2>
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