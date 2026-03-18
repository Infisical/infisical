import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input, ModalClose, Select, SelectItem } from "@app/components/v2";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  AzureEntraIdConnectionMethod,
  TAzureEntraIdConnection
} from "@app/hooks/api/appConnections/types/azure-entra-id-connection";

import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

const formSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.AzureEntraId),
  method: z.literal(AzureEntraIdConnectionMethod.ClientSecret),
  credentials: z.object({
    tenantId: z.string().trim().min(1, "Tenant ID is required"),
    clientId: z.string().trim().min(1, "Client ID is required"),
    clientSecret: z.string().trim().min(1, "Client Secret is required")
  })
});

type FormData = z.infer<typeof formSchema>;

type Props = {
  appConnection?: TAzureEntraIdConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

export const AzureEntraIdConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection
      ? {
          name: appConnection.name,
          description: appConnection.description,
          app: AppConnection.AzureEntraId,
          method: AzureEntraIdConnectionMethod.ClientSecret,
          credentials: {
            tenantId: appConnection.credentials.tenantId,
            clientId: appConnection.credentials.clientId,
            clientSecret: ""
          }
        }
      : {
          app: AppConnection.AzureEntraId,
          method: AzureEntraIdConnectionMethod.ClientSecret,
          credentials: {
            tenantId: "",
            clientId: "",
            clientSecret: ""
          }
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
          name="method"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              tooltipText={`The method you would like to use to connect with ${
                APP_CONNECTION_MAP[AppConnection.AzureEntraId].name
              }. This field cannot be changed after creation.`}
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Method"
            >
              <Select
                isDisabled={isUpdate}
                value={value}
                onValueChange={(val) => onChange(val)}
                className="w-full border border-mineshaft-500"
                position="popper"
                dropdownContainerClassName="max-w-none"
              >
                {Object.values(AzureEntraIdConnectionMethod).map((method) => {
                  return (
                    <SelectItem value={method} key={method}>
                      {getAppConnectionMethodDetails(method).name}
                    </SelectItem>
                  );
                })}
              </Select>
            </FormControl>
          )}
        />

        <Controller
          name="credentials.tenantId"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              tooltipText="The Azure Active Directory (Entra ID) Tenant ID."
              isError={Boolean(error?.message)}
              label="Tenant ID"
              errorText={error?.message}
            >
              <Input {...field} placeholder="00000000-0000-0000-0000-000000000000" />
            </FormControl>
          )}
        />

        <Controller
          name="credentials.clientId"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              tooltipText="The Application (Client) ID of the Azure App Registration."
              isError={Boolean(error?.message)}
              label="Client ID"
              errorText={error?.message}
            >
              <Input {...field} placeholder="00000000-0000-0000-0000-000000000000" />
            </FormControl>
          )}
        />

        <Controller
          name="credentials.clientSecret"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              tooltipText="The client secret of the Azure App Registration."
              isError={Boolean(error?.message)}
              label="Client Secret"
              errorText={error?.message}
            >
              <Input {...field} type="password" placeholder="~JzD8e6S.tH~w8XRaNnKcb7W1fM4rCns7FY" />
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
            isDisabled={isSubmitting || (!isUpdate && !isDirty)}
          >
            {isUpdate ? "Reconnect to Azure" : "Connect to Azure"}
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
