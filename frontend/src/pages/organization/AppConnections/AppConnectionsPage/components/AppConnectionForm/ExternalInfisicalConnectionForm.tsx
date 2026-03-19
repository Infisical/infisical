import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  Button,
  FormControl,
  Input,
  ModalClose,
  SecretInput,
  Select,
  SelectItem
} from "@app/components/v2";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import {
  ExternalInfisicalConnectionMethod,
  TExternalInfisicalConnection
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TExternalInfisicalConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.ExternalInfisical)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(ExternalInfisicalConnectionMethod.MachineIdentityUniversalAuth),
    credentials: z.object({
      instanceUrl: z.string().trim().url("Must be a valid URL").min(1, "Instance URL is required"),
      machineIdentityClientId: z
        .string()
        .trim()
        .uuid("Must be a valid UUID")
        .min(1, "Client ID is required"),
      machineIdentityClientSecret: z.string().trim().min(1, "Client Secret is required")
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const ExternalInfisicalConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection
      ? {
          ...appConnection,
          credentials: {
            ...appConnection.credentials,
            machineIdentityClientSecret: ""
          }
        }
      : {
          app: AppConnection.ExternalInfisical,
          method: ExternalInfisicalConnectionMethod.MachineIdentityUniversalAuth
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
                APP_CONNECTION_MAP[AppConnection.ExternalInfisical].name
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
                {Object.values(ExternalInfisicalConnectionMethod).map((method) => {
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
          name="credentials.instanceUrl"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Instance URL"
              tooltipText="The base URL of the external Infisical instance (e.g., https://app.infisical.com)"
            >
              <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="https://app.infisical.com"
              />
            </FormControl>
          )}
        />
        <Controller
          name="credentials.machineIdentityClientId"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Machine Identity Client ID"
              tooltipText="The Client ID of the Machine Identity with Universal Auth configured on the external Infisical instance"
            >
              <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Enter Machine Identity Client ID"
              />
            </FormControl>
          )}
        />
        <Controller
          name="credentials.machineIdentityClientSecret"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Machine Identity Client Secret"
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
            {isUpdate ? "Update Credentials" : "Connect to Infisical"}
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
