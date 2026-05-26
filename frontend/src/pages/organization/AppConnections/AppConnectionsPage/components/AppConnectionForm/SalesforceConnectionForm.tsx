import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input, ModalClose, SecretInput } from "@app/components/v2";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  SalesforceConnectionMethod,
  TSalesforceConnection
} from "@app/hooks/api/appConnections/types/salesforce-connection";

import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TSalesforceConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Salesforce)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(SalesforceConnectionMethod.ClientCredentials),
    credentials: z.object({
      instanceUrl: z.string().trim().min(1, "Instance URL required"),
      consumerKey: z.string().trim().min(1, "Consumer Key required"),
      consumerSecret: z.string().trim().min(1, "Consumer Secret required")
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const SalesforceConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.Salesforce,
      method: SalesforceConnectionMethod.ClientCredentials
    }
  });

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isDirty }
  } = form;

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {!isUpdate && <GenericAppConnectionsFields />}
        <Controller
          name="credentials.instanceUrl"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Instance URL"
              tooltipText="Your Salesforce My Domain URL (e.g. my-org.my.salesforce.com)."
            >
              <Input {...field} placeholder="my-org.my.salesforce.com" />
            </FormControl>
          )}
        />
        <Controller
          name="credentials.consumerKey"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Consumer Key"
            >
              <Input {...field} placeholder="3MVG9..." />
            </FormControl>
          )}
        />
        <Controller
          name="credentials.consumerSecret"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Consumer Secret"
            >
              <SecretInput
                containerClassName="text-gray-400 group-focus-within:border-primary-400/50! border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
            </FormControl>
          )}
        />
        <div className="mt-8 flex items-center">
          <Button
            className="mr-4"
            size="sm"
            type="submit"
            colorSchema="secondary"
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
          >
            {isUpdate ? "Update Credentials" : "Connect to Salesforce"}
          </Button>
          <ModalClose asChild>
            <Button colorSchema="secondary" variant="plain">
              Cancel
            </Button>
          </ModalClose>
        </div>
      </form>
    </FormProvider>
  );
};
