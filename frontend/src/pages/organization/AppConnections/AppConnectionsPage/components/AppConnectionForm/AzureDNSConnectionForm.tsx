import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  SecretInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { TAzureDNSConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { AzureDNSConnectionMethod } from "@app/hooks/api/appConnections/types/azure-dns-connection";

import { useAppConnectionForm } from "./AppConnectionFormContext";
import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";
import {
  AzureManagedIdentityConnectionDetails,
  AzureManagedIdentityFields
} from "./shared/AzureManagedIdentityFields";
import { CredentialRotationForm } from "./shared/CredentialRotationForm";

type Props = {
  appConnection?: TAzureDNSConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.AzureDNS)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(AzureDNSConnectionMethod.ClientSecret),
    credentials: z.object({
      tenantId: z.string().trim().min(1, "Tenant ID required"),
      clientId: z.string().trim().min(1, "Client ID required"),
      clientSecret: z.string().trim().min(1, "Client Secret required"),
      subscriptionId: z.string().trim().min(1, "Subscription ID required"),
      clientSecretKeyId: z.string().trim().optional()
    })
  }),
  rootSchema.extend({
    method: z.literal(AzureDNSConnectionMethod.ManagedIdentity),
    credentials: z.object({
      tenantId: z.string().trim().min(1, "Tenant ID required"),
      clientId: z.string().trim().min(1, "Client ID required"),
      subscriptionId: z.string().trim().min(1, "Subscription ID required")
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

const defaultRotation = {
  rotationInterval: 30,
  rotateAtUtc: {
    hours: 0,
    minutes: 0
  }
};

export const AzureDNSConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const { isNewConnection } = useAppConnectionForm();
  const [hasVerifyFailed, setHasVerifyFailed] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection
      ? {
          ...appConnection,
          isAutoRotationEnabled: appConnection.isAutoRotationEnabled,
          rotation: appConnection.rotation ?? defaultRotation
        }
      : {
          app: AppConnection.AzureDNS,
          method: AzureDNSConnectionMethod.ClientSecret,
          isAutoRotationEnabled: false,
          rotation: defaultRotation,
          credentials: {
            tenantId: "",
            clientId: "",
            clientSecret: "",
            subscriptionId: ""
          }
        }
  });

  const { handleSubmit, control, watch, setValue } = form;

  const selectedMethod = watch("method");

  const federatedCredential =
    appConnection?.method === AzureDNSConnectionMethod.ManagedIdentity
      ? appConnection.credentials.federatedCredential
      : undefined;

  const onSubmitHandler = async (formData: FormData) => {
    if (formData.method !== AzureDNSConnectionMethod.ManagedIdentity || !isUpdate) {
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

  const isManagedIdentity = selectedMethod === AzureDNSConnectionMethod.ManagedIdentity;
  // Azure needs the connection ID in the subject, so a new connection is created from the federated credential step
  const isConfiguringManagedIdentity = isManagedIdentity && !isUpdate;

  let submitLabel = isUpdate ? "Update Credentials" : "Connect to Azure DNS";
  if (isConfiguringManagedIdentity) {
    submitLabel = "Create Connection";
  } else if (isManagedIdentity) {
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
              <FieldLabel>
                Method
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    {`The method you would like to use to connect with ${
                      APP_CONNECTION_MAP[AppConnection.AzureDNS].name
                    }. This field cannot be changed after creation.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select
                disabled={isUpdate}
                value={value}
                onValueChange={(val) => {
                  onChange(val);
                  if (val === AzureDNSConnectionMethod.ManagedIdentity) {
                    setValue("isAutoRotationEnabled", false);
                  }
                }}
              >
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(AzureDNSConnectionMethod).map((method) => {
                    return (
                      <SelectItem value={method} key={method}>
                        {getAppConnectionMethodDetails(method).name}{" "}
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
        {selectedMethod === AzureDNSConnectionMethod.ClientSecret && (
          <>
            <Controller
              name="credentials.tenantId"
              control={control}
              shouldUnregister
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="tenant-id">Tenant ID</FieldLabel>
                  <Input
                    id="tenant-id"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="00000000-0000-0000-0000-000000000000"
                    isError={Boolean(error?.message)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.clientId"
              control={control}
              shouldUnregister
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="client-id">Client ID</FieldLabel>
                  <Input
                    id="client-id"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="00000000-0000-0000-0000-000000000000"
                    isError={Boolean(error?.message)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.clientSecret"
              control={control}
              shouldUnregister
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="client-secret">Client Secret</FieldLabel>
                  <SecretInput
                    aria-describedby={error ? "client-secret-error" : undefined}
                    id="client-secret"
                    isError={Boolean(error)}
                    placeholder="~JzD8e6S.tH~w8XRaNnKcb7W1fM4rCns7FY"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                  />
                  <FieldError id="client-secret-error" errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.subscriptionId"
              control={control}
              shouldUnregister
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="subscription-id">Subscription ID</FieldLabel>
                  <Input
                    id="subscription-id"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="00000000-0000-0000-0000-000000000000"
                    isError={Boolean(error?.message)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <CredentialRotationForm>
              <Controller
                name="credentials.clientSecretKeyId"
                control={control}
                render={({ field: { value, onChange }, fieldState: { error } }) => (
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
                      id="credentials.clientSecretKeyId"
                      value={value}
                      onChange={(e) => onChange(e.target.value)}
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
          >
            <Controller
              name="credentials.subscriptionId"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="subscription-id">Subscription ID</FieldLabel>
                  <Input
                    id="subscription-id"
                    value={value}
                    onChange={(e) => {
                      onChange(e.target.value);
                      setHasVerifyFailed(false);
                    }}
                    disabled={isNewConnection}
                    placeholder="00000000-0000-0000-0000-000000000000"
                    isError={Boolean(error?.message)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          </AzureManagedIdentityFields>
        )}
        <AppConnectionFormFooter
          submitLabel={submitLabel}
          isDisabled={isConfiguringManagedIdentity}
          allowPristineSubmit={isManagedIdentity && isUpdate}
          hint={
            isConfiguringManagedIdentity ? "Configure the federated credential first." : undefined
          }
        />
      </form>
    </FormProvider>
  );
};
