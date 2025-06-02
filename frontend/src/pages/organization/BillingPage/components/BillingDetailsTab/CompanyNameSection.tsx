import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, FormControl, Input } from "@app/components/v2";
import { OrgPermissionBillingActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useGetOrgBillingDetails, useUpdateOrgBillingDetails } from "@app/hooks/api";

const schema = z
  .object({
    name: z.string()
  })
  .required();

export const CompanyNameSection = () => {
  const { currentOrg } = useOrganization();
  const { reset, control, handleSubmit } = useForm({
    defaultValues: {
      name: ""
    },
    resolver: zodResolver(schema)
  });
  const { data } = useGetOrgBillingDetails(currentOrg?.id ?? "");
  const { mutateAsync, isPending } = useUpdateOrgBillingDetails();

  useEffect(() => {
    if (data) {
      reset({
        name: data?.name ?? ""
      });
    }
  }, [data]);

  const onFormSubmit = async ({ name }: { name: string }) => {
    try {
      if (!currentOrg?.id) return;
      if (name === "") return;
      await mutateAsync({
        name,
        organizationId: currentOrg.id
      });

      createNotification({
        text: "Successfully updated business name",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to update business name",
        type: "error"
      });
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit)}
      className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
    >
      <h2 className="mb-8 flex-1 text-xl font-semibold text-mineshaft-100">Business name</h2>
      <div className="max-w-md">
        <Controller
          defaultValue=""
          render={({ field, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message}>
              <Input placeholder="Acme Corp" {...field} className="bg-mineshaft-800" />
            </FormControl>
          )}
          control={control}
          name="name"
        />
      </div>
      <OrgPermissionCan
        I={OrgPermissionBillingActions.ManageBilling}
        a={OrgPermissionSubjects.Billing}
      >
        {(isAllowed) => (
          <Button
            type="submit"
            colorSchema="secondary"
            isLoading={isPending}
            isDisabled={isPending || !isAllowed}
          >
            Save
          </Button>
        )}
      </OrgPermissionCan>
    </form>
  );
};
