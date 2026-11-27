import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SheetFooter,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { useScopeVariant } from "@app/hooks";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  AzureEntraIdConnectionMethod,
  TAzureEntraIdConnection
} from "@app/hooks/api/appConnections/types/azure-entra-id-connection";

import { useAppConnectionForm, useAppConnectionFormDirtyState } from "./AppConnectionFormContext";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";
import {
  AzureManagedIdentityConnectionDetails,
  AzureManagedIdentityFields
} from "./shared/AzureManagedIdentityFields";
import { CredentialRotationForm } from "./shared/CredentialRotationForm";

const baseSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.AzureEntraId)
});

const formSchema = z.discriminatedUnion("method", [
  baseSchema.extend({
    method: z.literal(AzureEntraIdConnectionMethod.ClientSecret),
    credentials: z.object({
      tenantId: z.string().trim().min(1, "Tenant ID is required"),
      clientId: z.string().trim().min(1, "Client ID is required"),
      clientSecret: z.string().trim().min(1, "Client Secret is required"),
      clientSecretKeyId: z.string().trim().optional()
    })
  }),
  baseSchema.extend({
    method: z.literal(AzureEntraIdConnectionMethod.ManagedIdentity),
    credentials: z.object({
      tenantId: z.string().trim().min(1, "Tenant ID is required"),
      clientId: z.string().trim().min(1, "Client ID is required")
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

type Props = {
  appConnection?: TAzureEntraIdConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const defaultRotation = {
  rotationInterval: 30,
  rotateAtUtc: {
    hours: 0,
    minutes: 0
  }
};

const getDefaultValues = (appConnection?: TAzureEntraIdConnection): Partial<FormData> => {
  if (!appConnection) {
    return {
      app: AppConnection.AzureEntraId,
      method: AzureEntraIdConnectionMethod.ClientSecret,
      isAutoRotationEnabled: false,
      rotation: defaultRotation,
      credentials: {
        tenantId: "",
        clientId: "",
        clientSecret: ""
      }
    };
  }

  const base = {
    name: appConnection.name,
    description: appConnection.description,
    app: AppConnection.AzureEntraId as const,
    isAutoRotationEnabled: appConnection.isAutoRotationEnabled,
    rotation: appConnection.rotation ?? defaultRotation
  };

  if (appConnection.method === AzureEntraIdConnectionMethod.ManagedIdentity) {
    return {
      ...base,
      method: AzureEntraIdConnectionMethod.ManagedIdentity,
      credentials: {
        tenantId: appConnection.credentials.tenantId,
        clientId: appConnection.credentials.clientId
      }
    };
  }

  return {
    ...base,
    method: AzureEntraIdConnectionMethod.ClientSecret,
    credentials: {
      tenantId: appConnection.credentials.tenantId,
      clientId: appConnection.credentials.clientId,
      clientSecret: ""
    }
  };
};

export const AzureEntraIdConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const { onCancel } = useAppConnectionForm();
  const [hasVerifyFailed, setHasVerifyFailed] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: getDefaultValues(appConnection)
  });

  const {
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { isSubmitting, isDirty }
  } = form;

  useAppConnectionFormDirtyState(isDirty);

  const scopeVariant = useScopeVariant();

  const selectedMethod = watch("method");

  const federatedCredential =
    appConnection?.method === AzureEntraIdConnectionMethod.ManagedIdentity
      ? appConnection.credentials.federatedCredential
      : undefined;

  const onSubmitHandler = async (formData: FormData) => {
    if (formData.method !== AzureEntraIdConnectionMethod.ManagedIdentity || !isUpdate) {
      await onSubmit(formData);
      return;
    }
    setHasVerifyFailed(false);
    try {
      await onSubmit(formData);
    } catch {
      // The request's error toast already explains the failure
      setHasVerifyFailed(true);
    }
  };

  const isManagedIdentity = selectedMethod === AzureEntraIdConnectionMethod.ManagedIdentity;
  // Azure needs the connection ID in the subject, so a new connection is created from the federated credential step
  const isConfiguringManagedIdentity = isManagedIdentity && !isUpdate;

  let submitLabel = isUpdate ? "Reconnect to Azure" : "Connect to Azure";
  if (isManagedIdentity) {
    submitLabel = hasVerifyFailed ? "Retry Verification" : "Verify Connection";
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmitHandler)}>
        {!isUpdate && <GenericAppConnectionsFields />}
        {appConnection && isManagedIdentity && (
          <AzureManagedIdentityConnectionDetails appConnection={appConnection} />
        )}

        <Controller
          name="method"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="method">
                Method
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The method you would like to use to connect with{" "}
                    {APP_CONNECTION_MAP[AppConnection.AzureEntraId].name}. This field cannot be
                    changed after creation.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select
                disabled={isUpdate}
                value={value}
                onValueChange={(val) => {
                  onChange(val);
                  if (val === AzureEntraIdConnectionMethod.ManagedIdentity) {
                    setValue("isAutoRotationEnabled", false);
                  }
                }}
              >
                <SelectTrigger id="method" className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(AzureEntraIdConnectionMethod).map((method) => {
                    return (
                      <SelectItem value={method} key={method}>
                        {getAppConnectionMethodDetails(method).name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {isUpdate && isManagedIdentity && (
                <FieldDescription>
                  Name and method are fixed once the connection is created.
                </FieldDescription>
              )}
              <FieldError errors={[error]} />
            </Field>
          )}
        />

        {selectedMethod === AzureEntraIdConnectionMethod.ClientSecret && (
          <>
            <Controller
              name="credentials.tenantId"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="credentials.tenantId">
                    Tenant ID
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        The Azure Active Directory (Entra ID) Tenant ID.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Input
                    {...field}
                    id="credentials.tenantId"
                    placeholder="00000000-0000-0000-0000-000000000000"
                    isError={Boolean(error)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />

            <Controller
              name="credentials.clientId"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="credentials.clientId">
                    Client ID
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        The Application (Client) ID of the Azure App Registration.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Input
                    {...field}
                    id="credentials.clientId"
                    placeholder="00000000-0000-0000-0000-000000000000"
                    isError={Boolean(error)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />

            <Controller
              name="credentials.clientSecret"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="credentials.clientSecret">
                    Client Secret
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        The client secret of the Azure App Registration.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Input
                    {...field}
                    id="credentials.clientSecret"
                    type="password"
                    placeholder="~JzD8e6S.tH~w8XRaNnKcb7W1fM4rCns7FY"
                    isError={Boolean(error)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />

            <CredentialRotationForm>
              <Controller
                name="credentials.clientSecretKeyId"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <Field className="mb-4">
                    <FieldLabel htmlFor="credentials.clientSecretKeyId">
                      Client Secret Key ID
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm">
                          The Key ID of the client secret provided above. Found in Azure Portal
                          under App Registrations &gt; Certificates &amp; Secrets. Required so
                          Infisical can revoke the original secret after rotation.
                        </TooltipContent>
                      </Tooltip>
                    </FieldLabel>
                    <Input
                      {...field}
                      id="credentials.clientSecretKeyId"
                      placeholder="00000000-0000-0000-0000-000000000000"
                      isError={Boolean(error)}
                    />
                    <FieldError errors={[error]} />
                  </Field>
                )}
              />
            </CredentialRotationForm>
          </>
        )}

        {isManagedIdentity && (
          <AzureManagedIdentityFields
            isUpdate={isUpdate}
            federatedCredential={federatedCredential}
            onCredentialsChange={() => setHasVerifyFailed(false)}
          />
        )}

        <SheetFooter className="sticky bottom-0 -mx-4 items-center border-t bg-popover">
          {isConfiguringManagedIdentity ? (
            <Button variant={scopeVariant} isDisabled>
              Create Connection
            </Button>
          ) : (
            <Button
              type="submit"
              variant={scopeVariant}
              isPending={isSubmitting}
              isDisabled={isSubmitting || (!isUpdate && !isDirty)}
            >
              {submitLabel}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onCancel} isDisabled={isSubmitting}>
            Cancel
          </Button>
          {isConfiguringManagedIdentity && (
            <span className="text-xs text-muted">Configure the federated credential first.</span>
          )}
        </SheetFooter>
      </form>
    </FormProvider>
  );
};
