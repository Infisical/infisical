import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Field,
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
import { GatewayPicker } from "@app/components/v3/platform/GatewayPicker";
import { OrgPermissionSubjects, useSubscription } from "@app/context";
import { OrgGatewayPermissionActions } from "@app/context/OrgPermissionContext/types";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { SshConnectionMethod, TSshConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TSshConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const configurationSchema = z.object({
  blockedUsers: z.string().trim().optional()
});

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.SSH),
  configuration: configurationSchema.optional()
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(SshConnectionMethod.Password),
    credentials: z.object({
      host: z.string().trim().min(1, "Host required"),
      port: z.coerce.number().int().min(1).max(65535, "Port must be between 1 and 65535"),
      username: z.string().trim().min(1, "Username required"),
      password: z.string().trim().min(1, "Password required")
    })
  }),
  rootSchema.extend({
    method: z.literal(SshConnectionMethod.SshKey),
    credentials: z.object({
      host: z.string().trim().min(1, "Host required"),
      port: z.coerce.number().int().min(1).max(65535, "Port must be between 1 and 65535"),
      username: z.string().trim().min(1, "Username required"),
      privateKey: z.string().trim().min(1, "Private key required"),
      passphrase: z.string().trim().optional()
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const SshConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection
      ? {
          ...appConnection,
          credentials: {
            ...appConnection.credentials,
            ...(appConnection.method === SshConnectionMethod.Password
              ? { password: "" }
              : { privateKey: "", passphrase: "" })
          }
        }
      : {
          app: AppConnection.SSH,
          method: SshConnectionMethod.SshKey,
          gatewayId: null,
          gatewayPoolId: null,
          credentials: {
            host: "",
            port: 22,
            username: "",
            privateKey: ""
          }
        }
  });

  const { handleSubmit, control, watch, setValue } = form;

  const selectedMethod = watch("method");
  const gatewayId = watch("gatewayId");
  const gatewayPoolId = watch("gatewayPoolId");
  const { subscription } = useSubscription();

  const handleMethodChange = (newMethod: SshConnectionMethod) => {
    const currentCredentials = form.getValues("credentials");

    if (newMethod === SshConnectionMethod.Password) {
      setValue("method", SshConnectionMethod.Password);
      setValue("credentials", {
        host: currentCredentials.host,
        port: currentCredentials.port,
        username: currentCredentials.username,
        password: ""
      });
    } else {
      setValue("method", SshConnectionMethod.SshKey);
      setValue("credentials", {
        host: currentCredentials.host,
        port: currentCredentials.port,
        username: currentCredentials.username,
        privateKey: "",
        passphrase: ""
      });
    }
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {!isUpdate && <GenericAppConnectionsFields />}
        {subscription.gateway && (
          <OrgPermissionCan
            I={OrgGatewayPermissionActions.AttachGateways}
            a={OrgPermissionSubjects.Gateway}
          >
            {(isAllowed) => (
              <Field className="mb-4">
                <FieldLabel>Gateway</FieldLabel>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <GatewayPicker
                        isDisabled={!isAllowed}
                        value={{
                          gatewayId: gatewayId ?? null,
                          gatewayPoolId: gatewayPoolId ?? null
                        }}
                        onChange={({ gatewayId: newGwId, gatewayPoolId: newPoolId }) => {
                          setValue("gatewayId", newGwId, { shouldDirty: true });
                          setValue("gatewayPoolId", newPoolId, { shouldDirty: true });
                        }}
                      />
                    </div>
                  </TooltipTrigger>
                  {!isAllowed && (
                    <TooltipContent>
                      Restricted access. You don&apos;t have permission to attach gateways to
                      resources.
                    </TooltipContent>
                  )}
                </Tooltip>
              </Field>
            )}
          </OrgPermissionCan>
        )}
        <Controller
          name="method"
          control={control}
          render={({ field: { value }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel>
                Authentication Method
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The authentication method you would like to use to connect with{" "}
                    {APP_CONNECTION_MAP[AppConnection.SSH].name}. This field cannot be changed after
                    creation.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select
                disabled={isUpdate}
                value={value}
                onValueChange={(val) => handleMethodChange(val as SshConnectionMethod)}
              >
                <SelectTrigger className="w-full" isError={Boolean(error?.message)}>
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(SshConnectionMethod).map((method) => (
                    <SelectItem value={method} key={method}>
                      {getAppConnectionMethodDetails(method).name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <div className="grid grid-cols-2 gap-2">
          <Controller
            name="credentials.host"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel htmlFor="ssh-host">Host</FieldLabel>
                <Input
                  id="ssh-host"
                  {...field}
                  placeholder="Hostname or IP address"
                  isError={Boolean(error?.message)}
                />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
          <Controller
            name="credentials.port"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel htmlFor="ssh-port">Port</FieldLabel>
                <Input
                  id="ssh-port"
                  {...field}
                  type="number"
                  placeholder="22"
                  isError={Boolean(error?.message)}
                />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        </div>
        <Controller
          name="credentials.username"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="ssh-username">Username</FieldLabel>
              <Input
                id="ssh-username"
                {...field}
                placeholder="SSH username"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        {selectedMethod === SshConnectionMethod.Password ? (
          <Controller
            name="credentials.password"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel>Password</FieldLabel>
                <SecretInput value={value} onChange={(e) => onChange(e.target.value)} />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        ) : (
          <>
            <Controller
              name="credentials.privateKey"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel>Private Key</FieldLabel>
                  <SecretInput
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.passphrase"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel>
                    Passphrase <span className="text-muted">(optional)</span>
                  </FieldLabel>
                  <SecretInput value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          </>
        )}
        <Controller
          name="configuration.blockedUsers"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel>
                Blocked Users <span className="text-muted">(optional)</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    A comma-separated list of usernames that are blocked from being used in
                    operations like secret rotation (e.g., root,admin,ubuntu).
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                {...field}
                value={field.value ?? ""}
                placeholder="root,admin,ubuntu"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <AppConnectionFormFooter submitLabel={isUpdate ? "Update Credentials" : "Connect to SSH"} />
      </form>
    </FormProvider>
  );
};
