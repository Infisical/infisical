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
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { GatewayPicker } from "@app/components/v3/platform/GatewayPicker";
import { OrgPermissionSubjects } from "@app/context";
import { OrgGatewayPermissionActions } from "@app/context/OrgPermissionContext/types";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { isIPv4, isIPv6 } from "@app/helpers/ip";
import { TRfc2136Connection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  Rfc2136ConnectionMethod,
  TsigAlgorithm
} from "@app/hooks/api/appConnections/types/rfc2136-connection";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TRfc2136Connection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const TSIG_ALGORITHM_LABELS: Record<TsigAlgorithm, string> = {
  [TsigAlgorithm.HmacSha256]: "HMAC-SHA256 (recommended)",
  [TsigAlgorithm.HmacSha384]: "HMAC-SHA384",
  [TsigAlgorithm.HmacSha512]: "HMAC-SHA512",
  [TsigAlgorithm.HmacSha224]: "HMAC-SHA224",
  [TsigAlgorithm.HmacSha1]: "HMAC-SHA1"
};

const BASE64_REGEX =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})$/;
const HOSTNAME_REGEX =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
const KEY_NAME_REGEX = /^(?:[A-Za-z0-9_-]{1,63}\.)*[A-Za-z0-9_-]{1,63}\.?$/;

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Rfc2136)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(Rfc2136ConnectionMethod.TsigKey),
    credentials: z.object({
      host: z
        .string()
        .trim()
        .min(1, "Host required")
        .max(253, "Host cannot exceed 253 characters")
        .refine(
          (value) =>
            HOSTNAME_REGEX.test(value) || isIPv4(value) || (isIPv6(value) && !value.includes("%")),
          { message: "Enter a hostname or IP address, without a scheme or port" }
        ),
      port: z.coerce
        .number()
        .int()
        .min(1, "Port must be between 1 and 65535")
        .max(65535, "Port must be between 1 and 65535"),
      tsigKeyName: z
        .string()
        .trim()
        .min(1, "Key name required")
        .max(253, "Key name cannot exceed 253 characters")
        .refine((value) => KEY_NAME_REGEX.test(value), {
          message: "Key name must be a valid DNS name (e.g. infisical-acme)"
        }),
      tsigAlgorithm: z.nativeEnum(TsigAlgorithm),
      tsigSecret: z
        .string()
        .trim()
        .min(1, "Secret required")
        .max(1024, "Secret cannot exceed 1024 characters")
        .refine((value) => BASE64_REGEX.test(value), {
          message: "Secret must be base64. Copy only the value between the quotes in the key file."
        })
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const Rfc2136ConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection
      ? { ...appConnection, credentials: { ...appConnection.credentials, tsigSecret: "" } }
      : {
          app: AppConnection.Rfc2136,
          method: Rfc2136ConnectionMethod.TsigKey,
          gatewayId: null,
          gatewayPoolId: null,
          credentials: {
            host: "",
            port: 53,
            tsigKeyName: "",
            tsigAlgorithm: TsigAlgorithm.HmacSha256,
            tsigSecret: ""
          }
        }
  });

  const { handleSubmit, control, setValue, watch } = form;

  const gatewayId = watch("gatewayId");
  const gatewayPoolId = watch("gatewayPoolId");

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {!isUpdate && <GenericAppConnectionsFields />}
        <OrgPermissionCan
          I={OrgGatewayPermissionActions.AttachGateways}
          a={OrgPermissionSubjects.Gateway}
        >
          {(isAllowed) => {
            const picker = (
              <GatewayPicker
                isDisabled={!isAllowed}
                value={{ gatewayId: gatewayId ?? null, gatewayPoolId: gatewayPoolId ?? null }}
                onChange={({ gatewayId: newGwId, gatewayPoolId: newPoolId }) => {
                  setValue("gatewayId", newGwId, { shouldDirty: true });
                  setValue("gatewayPoolId", newPoolId, { shouldDirty: true });
                }}
              />
            );

            return (
              <Field className="mb-4">
                <FieldLabel>Gateway</FieldLabel>
                <FieldDescription>
                  Route updates through a Gateway when your DNS server is not reachable from the
                  internet.
                </FieldDescription>
                {isAllowed ? (
                  picker
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="block w-full cursor-not-allowed">{picker}</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Restricted access. You don&apos;t have permission to attach gateways to
                      resources.
                    </TooltipContent>
                  </Tooltip>
                )}
              </Field>
            );
          }}
        </OrgPermissionCan>
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
                    {`The method you would like to use to connect with ${
                      APP_CONNECTION_MAP[AppConnection.Rfc2136].name
                    }. This field cannot be changed after creation.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger id="method" className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(Rfc2136ConnectionMethod).map((m) => (
                    <SelectItem value={m} key={m}>
                      {getAppConnectionMethodDetails(m).name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <div className="flex items-start gap-2">
          <Controller
            name="credentials.host"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <Field className="mb-4 flex-1">
                <FieldLabel htmlFor="rfc2136-host">Host</FieldLabel>
                <FieldDescription>The primary DNS server for your zone.</FieldDescription>
                <Input
                  id="rfc2136-host"
                  {...field}
                  placeholder="ns1.example.com"
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
              <Field className="mb-4 w-28">
                <FieldLabel htmlFor="rfc2136-port">Port</FieldLabel>
                <FieldDescription>TCP</FieldDescription>
                <Input
                  id="rfc2136-port"
                  {...field}
                  type="number"
                  placeholder="53"
                  isError={Boolean(error?.message)}
                />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        </div>
        <Controller
          name="credentials.tsigKeyName"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="rfc2136-key-name">Key Name</FieldLabel>
              <FieldDescription>The name of the TSIG key on your DNS server.</FieldDescription>
              <Input
                id="rfc2136-key-name"
                {...field}
                placeholder="infisical-acme"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.tsigAlgorithm"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="rfc2136-algorithm">Algorithm</FieldLabel>
              <Select value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger id="rfc2136-algorithm" className="w-full" isError={Boolean(error)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(TsigAlgorithm).map((algorithm) => (
                    <SelectItem value={algorithm} key={algorithm}>
                      {TSIG_ALGORITHM_LABELS[algorithm]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.tsigSecret"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="rfc2136-secret">Secret</FieldLabel>
              <FieldDescription>The base64 secret from the key file.</FieldDescription>
              <SecretInput
                aria-describedby={error ? "rfc2136-secret-error" : undefined}
                isError={Boolean(error)}
                id="rfc2136-secret"
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
              <FieldError id="rfc2136-secret-error" errors={[error]} />
            </Field>
          )}
        />
        <AppConnectionFormFooter
          submitLabel={isUpdate ? "Update Credentials" : "Connect to DNS Server"}
        />
      </form>
    </FormProvider>
  );
};
