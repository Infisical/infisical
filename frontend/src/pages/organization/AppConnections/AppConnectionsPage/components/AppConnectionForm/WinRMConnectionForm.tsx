import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import { OrgPermissionCan } from "@app/components/permissions";
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
        caCertificate: z.string().optional(),
        insecure: z.boolean()
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
        port: 5986,
        username: "",
        password: "",
        caCertificate: "",
        insecure: false
      }
    }
  });

  const { handleSubmit, control, setValue, watch } = form;

  const gatewayId = watch("gatewayId");
  const gatewayPoolId = watch("gatewayPoolId");
  const insecure = watch("credentials.insecure");
  const caCertificate = watch("credentials.caCertificate");
  // eslint-disable-next-line no-nested-ternary
  const tlsMode = insecure ? "skip" : caCertificate ? "ca" : "verify";

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
        <Field className="mb-4">
          <FieldLabel>TLS Certificate Verification</FieldLabel>
          <Select
            value={tlsMode}
            onValueChange={(val) => {
              if (val === "skip") {
                setValue("credentials.insecure", true, { shouldDirty: true });
                setValue("credentials.caCertificate", "", { shouldDirty: true });
              } else if (val === "ca") {
                setValue("credentials.insecure", false, { shouldDirty: true });
              } else {
                setValue("credentials.insecure", false, { shouldDirty: true });
                setValue("credentials.caCertificate", "", { shouldDirty: true });
              }
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="verify">Verify with system trust store</SelectItem>
              <SelectItem value="ca">Verify with a CA certificate</SelectItem>
              <SelectItem value="skip">Skip verification (self-signed listener)</SelectItem>
            </SelectContent>
          </Select>
          <FieldDescription>
            WinRM connections use HTTPS. For a self-signed listener, pin its CA certificate to keep
            server authentication. Skip verification only as a last resort: it gives confidentiality
            but does not authenticate the server.
          </FieldDescription>
        </Field>
        {tlsMode === "ca" && (
          <Controller
            name="credentials.caCertificate"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel htmlFor="caCertificate">CA Certificate (PEM)</FieldLabel>
                <TextArea
                  id="caCertificate"
                  {...field}
                  placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
                  rows={5}
                  isError={Boolean(error?.message)}
                />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        )}
        <AppConnectionFormFooter
          submitLabel={isUpdate ? "Update Credentials" : "Connect to Windows (WinRM)"}
        />
      </form>
    </FormProvider>
  );
};
