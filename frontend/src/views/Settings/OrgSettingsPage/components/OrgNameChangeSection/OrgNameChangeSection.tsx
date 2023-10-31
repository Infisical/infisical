import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, FormControl, Input } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useRenameOrg } from "@app/hooks/api";

const formSchema = yup.object({
  name: yup.string().required().label("Project Name")
});

type FormData = yup.InferType<typeof formSchema>;

export const OrgNameChangeSection = (): JSX.Element => {
  const { currentOrg } = useOrganization();
  const { createNotification } = useNotificationContext();
  const { handleSubmit, control, reset } = useForm<FormData>({
    resolver: yupResolver(formSchema)
  });
  const { mutateAsync, isLoading } = useRenameOrg();

  useEffect(() => {
    if (currentOrg) {
      reset({ name: currentOrg.name });
    }
  }, [currentOrg]);

  const onFormSubmit = async ({ name }: FormData) => {
    try {
      if (!currentOrg?._id) return;
      if (name === "") return;

      await mutateAsync({ orgId: currentOrg?._id, newOrgName: name });
      createNotification({
        text: "Successfully renamed organization",
        type: "success"
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to rename organization",
        type: "error"
      });
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit)}
      className="p-4 bg-mineshaft-900 mb-6 rounded-lg border border-mineshaft-600"
    >
      <p className="text-xl font-semibold text-mineshaft-100 mb-4">Name</p>
      <div className="mb-2 max-w-md">
        <Controller
          defaultValue=""
          render={({ field, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message}>
              <Input placeholder="Acme Corp" {...field} />
            </FormControl>
          )}
          control={control}
          name="name"
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
