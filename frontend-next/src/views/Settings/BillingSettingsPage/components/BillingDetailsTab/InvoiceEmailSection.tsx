import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, FormControl, Input } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useGetOrgBillingDetails, useUpdateOrgBillingDetails } from "@app/hooks/api";

const schema = yup
  .object({
    email: yup.string().required("Email is required")
  })
  .required();

export const InvoiceEmailSection = () => {
  
  const { currentOrg } = useOrganization();
  const { reset, control, handleSubmit } = useForm({
    defaultValues: {
      email: ""
    },
    resolver: yupResolver(schema)
  });
  const { data } = useGetOrgBillingDetails(currentOrg?.id ?? "");
  const { mutateAsync, isLoading } = useUpdateOrgBillingDetails();

  useEffect(() => {
    if (data) {
      reset({
        email: data?.email ?? ""
      });
    }
  }, [data]);

  const onFormSubmit = async ({ email }: { email: string }) => {
    try {
      if (!currentOrg?.id) return;
      if (email === "") return;

      await mutateAsync({
        email,
        organizationId: currentOrg.id
      });

      createNotification({
        text: "Successfully updated invoice email recipient",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to update invoice email recipient",
        type: "error"
      });
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit)}
      className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
    >
      <h2 className="mb-8 flex-1 text-xl font-semibold text-white">Invoice email recipient</h2>
      <div className="max-w-md">
        <Controller
          defaultValue=""
          render={({ field, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message}>
              <Input placeholder="jane@acme.com" {...field} className="bg-mineshaft-800" />
            </FormControl>
          )}
          control={control}
          name="email"
        />
      </div>
      <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Billing}>
        {(isAllowed) => (
          <Button
            type="submit"
            colorSchema="secondary"
            isLoading={isLoading}
            isDisabled={isLoading || !isAllowed}
          >
            Save
          </Button>
        )}
      </OrgPermissionCan>
    </form>
  );
};
