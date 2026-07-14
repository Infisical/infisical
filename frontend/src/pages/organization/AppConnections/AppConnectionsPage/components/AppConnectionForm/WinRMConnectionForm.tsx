import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Label,
  SecretInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { GatewayPicker } from "@app/components/v3/platform/GatewayPicker";
import { OrgPermissionSubjects } from "@app/context";
import { OrgGatewayPermissionActions } from "@app/context/OrgPermissionContext/types";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { TWinRMConnection, WinRMConnectionMethod } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TWinRMConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.WinRM)
});

const formSchema = z
  .discriminatedUnion("method", [
    rootSchema.extend({
      method: z.literal(WinRMConnectionMethod.UsernamePassword),
      credentials: z.object({
        host: z.string().trim().min(1, "Host required"),
        port: z.coerce.number().int().min(1).max(65535),
        username: z.string().trim().min(1, "Username required"),
        password: z.string().min(1, "Password required"),
        sslEnabled: z.boolean(),
        sslRejectUnauthorized: z.boolean(),
        sslCertificate: z.string().optional()
      })
    })
  ])
  .superRefine((data, ctx) => {
    if (!data.gatewayId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Gateway required",
        path: ["gatewayId"]
      });
    }
  });

type FormData = z.infer<typeof formSchema>;

export const WinRMConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.WinRM,
      method: WinRMConnectionMethod.UsernamePassword,
      gatewayId: null,
      gatewayPoolId: null,
      credentials: {
        host: "",
        port: 5985,
        username: "",
        password: "",
        sslEnabled: false,
        sslRejectUnauthorized: true,
        sslCertificate: ""
      }
    }
  });

  const { handleSubmit, control, setValue, watch } = form;

  const gatewayId = watch("gatewayId");
  const gatewayPoolId = watch("gatewayPoolId");
  const sslEnabled = watch("credentials.sslEnabled");

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {!isUpdate && <GenericAppConnectionsFields />}
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
                      APP_CONNECTION_MAP[AppConnection.WinRM].name
                    }. This field cannot be changed after creation.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(WinRMConnectionMethod).map((method) => {
                    return (
                      <SelectItem value={method} key={method}>
                        {getAppConnectionMethodDetails(method).name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <OrgPermissionCan
          I={OrgGatewayPermissionActions.AttachGateways}
          a={OrgPermissionSubjects.Gateway}
        >
          {(isAllowed) => (
            <Controller
              name="gatewayId"
              control={control}
              render={({ fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel>Gateway</FieldLabel>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <GatewayPicker
                          isRequired
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
                  <FieldDescription>
                    Windows hosts are reached over WinRM through a Gateway inside your network.
                  </FieldDescription>
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          )}
        </OrgPermissionCan>
        <div className="grid grid-cols-3 gap-2">
          <Controller
            name="credentials.host"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <Field className="col-span-2 mb-4">
                <FieldLabel htmlFor="host">Host</FieldLabel>
                <Input
                  id="host"
                  {...field}
                  placeholder="win01.corp.example.com"
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
                <FieldLabel htmlFor="port">Port</FieldLabel>
                <Input
                  id="port"
                  type="number"
                  {...field}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                  isError={Boolean(error?.message)}
                />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Controller
            name="credentials.username"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel htmlFor="username">Username</FieldLabel>
                <Input
                  id="username"
                  {...field}
                  placeholder="DOMAIN\\username or user@domain.com"
                  isError={Boolean(error?.message)}
                />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
          <Controller
            name="credentials.password"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <SecretInput value={value} onChange={(e) => onChange(e.target.value)} />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        </div>
        <Controller
          name="credentials.sslEnabled"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mt-2 mb-4">
              <Field orientation="horizontal">
                <FieldContent>
                  <Label htmlFor="ssl-enabled">Enable SSL</Label>
                  <FieldDescription>
                    Connect over HTTPS. When disabled, HTTP with NTLM message encryption is used and
                    no server certificate is required.
                  </FieldDescription>
                </FieldContent>
                <Switch id="ssl-enabled" checked={value} onCheckedChange={onChange} />
              </Field>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.sslCertificate"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <Field className={sslEnabled ? "mb-4" : "mb-4 opacity-50"}>
              <FieldLabel htmlFor="ssl-certificate">
                SSL Certificate <span className="text-mineshaft-400">(optional)</span>
              </FieldLabel>
              <TextArea
                id="ssl-certificate"
                {...field}
                disabled={!sslEnabled}
                placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
                rows={5}
                isError={Boolean(error?.message)}
              />
              <FieldDescription>
                Leave empty to verify against the system trust store, or paste the listener&apos;s
                certificate to verify a self-signed WinRM HTTPS listener.
              </FieldDescription>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.sslRejectUnauthorized"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className={sslEnabled ? "mb-4" : "mb-4 opacity-50"}>
              <Field orientation="horizontal">
                <FieldContent>
                  <Label htmlFor="ssl-reject-unauthorized">Reject Unauthorized</Label>
                  <FieldDescription>
                    If enabled, Infisical only connects when the listener presents a valid, trusted
                    certificate.
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="ssl-reject-unauthorized"
                  checked={sslEnabled ? value : false}
                  onCheckedChange={onChange}
                  disabled={!sslEnabled}
                />
              </Field>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <AppConnectionFormFooter
          submitLabel={isUpdate ? "Update Credentials" : "Connect to Windows (WinRM)"}
        />
      </form>
    </FormProvider>
  );
};
