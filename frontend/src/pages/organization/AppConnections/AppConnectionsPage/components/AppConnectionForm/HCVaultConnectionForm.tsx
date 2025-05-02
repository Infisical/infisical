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
import { HCVaultConnectionMethod, THCVaultConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: THCVaultConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.HCVault)
});

const InstanceUrlSchema = z
  .string()
  .trim()
  .min(1, "Instance URL required")
  .url("Invalid Instance URL");

const NamespaceSchema = z.string().trim().optional();

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(HCVaultConnectionMethod.AccessToken),
    credentials: z.object({
      instanceUrl: InstanceUrlSchema,
      namespace: NamespaceSchema,
      accessToken: z.string().trim().min(1, "Access Token required")
    })
  }),
  rootSchema.extend({
    method: z.literal(HCVaultConnectionMethod.AppRole),
    credentials: z.object({
      instanceUrl: InstanceUrlSchema,
      namespace: NamespaceSchema,
      roleId: z.string().trim().min(1, "Role ID required"),
      secretId: z.string().trim().min(1, "Secret ID required")
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const HCVaultConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.HCVault,
      method: HCVaultConnectionMethod.AppRole
    }
  });

  const {
    handleSubmit,
    control,
    watch,
    formState: { isSubmitting, isDirty }
  } = form;

  const selectedMethod = watch("method");

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
                APP_CONNECTION_MAP[AppConnection.HCVault].name
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
                {Object.values(HCVaultConnectionMethod).map((method) => {
                  return (
                    <SelectItem value={method} key={method}>
                      {getAppConnectionMethodDetails(method).name}{" "}
                      {method === HCVaultConnectionMethod.AppRole ? " (Recommended)" : ""}
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
          render={({ field, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Instance URL"
              tooltipClassName="max-w-sm"
              tooltipText="The URL at which your Hashicorp Vault instance is hosted."
            >
              <Input {...field} placeholder="https://vault.example.com" />
            </FormControl>
          )}
        />
        <Controller
          name="credentials.namespace"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Namespace"
              isOptional
              tooltipClassName="max-w-sm"
              tooltipText="On self-hosted and enterprise clusters there may not be namespaces."
            >
              <Input {...field} placeholder="admin" />
            </FormControl>
          )}
        />
        {selectedMethod === HCVaultConnectionMethod.AccessToken ? (
          <Controller
            name="credentials.accessToken"
            control={control}
            shouldUnregister
            render={({ field, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error?.message)}
                label="Access Token"
              >
                <SecretInput
                  {...field}
                  containerClassName="text-gray-400 group-focus-within:!border-primary-400/50 border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
                />
              </FormControl>
            )}
          />
        ) : (
          <>
            <Controller
              name="credentials.roleId"
              control={control}
              shouldUnregister
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  errorText={error?.message}
                  isError={Boolean(error?.message)}
                  label="Role ID"
                >
                  <Input {...field} placeholder="00000000-0000-0000-0000-000000000000" />
                </FormControl>
              )}
            />
            <Controller
              name="credentials.secretId"
              control={control}
              shouldUnregister
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  errorText={error?.message}
                  isError={Boolean(error?.message)}
                  label="Secret ID"
                >
                  <SecretInput
                    {...field}
                    containerClassName="text-gray-400 group-focus-within:!border-primary-400/50 border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
                  />
                </FormControl>
              )}
            />
          </>
        )}
        <div className="mt-8 flex items-center">
          <Button
            className="mr-4"
            size="sm"
            type="submit"
            colorSchema="secondary"
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
          >
            {isUpdate ? "Update Credentials" : "Connect to Hashicorp Vault"}
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
