import { useState } from "react";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { GatewayPicker } from "@app/components/v3/platform/GatewayPicker";
import { OrgPermissionSubjects } from "@app/context";
import { OrgGatewayPermissionActions } from "@app/context/OrgPermissionContext/types";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { useScopeVariant } from "@app/hooks";
import {
  KempLoadMasterConnectionMethod,
  TKempLoadMasterConnection
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TKempLoadMasterConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.KempLoadMaster)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(KempLoadMasterConnectionMethod.BasicAuth),
    credentials: z.object({
      hostname: z
        .string()
        .trim()
        .min(1, "Hostname is required")
        .max(512, "Hostname cannot exceed 512 characters"),
      port: z
        .union([z.coerce.number().int().min(1).max(65535), z.literal("")])
        .optional()
        .transform((val) => (val === "" ? undefined : val)),
      username: z
        .string()
        .trim()
        .min(1, "Username is required")
        .max(256, "Username cannot exceed 256 characters"),
      password: z
        .string()
        .trim()
        .min(1, "Password is required")
        .max(512, "Password cannot exceed 512 characters"),
      sslRejectUnauthorized: z.boolean(),
      sslCertificate: z
        .string()
        .trim()
        .transform((value) => value || undefined)
        .optional()
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const KempLoadMasterConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const [selectedTab, setSelectedTab] = useState("configuration");

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.KempLoadMaster,
      method: KempLoadMasterConnectionMethod.BasicAuth,
      gatewayId: null,
      gatewayPoolId: null,
      credentials: {
        sslRejectUnauthorized: true,
        sslCertificate: undefined
      }
    }
  });

  const { handleSubmit, control, setValue, watch } = form;
  const scopeVariant = useScopeVariant();

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
          {(isAllowed) => (
            <Field className="mb-4">
              <FieldLabel>Gateway</FieldLabel>
              {isAllowed ? (
                <GatewayPicker
                  isDisabled={!isAllowed}
                  value={{ gatewayId: gatewayId ?? null, gatewayPoolId: gatewayPoolId ?? null }}
                  onChange={({ gatewayId: newGwId, gatewayPoolId: newPoolId }) => {
                    setValue("gatewayId", newGwId, { shouldDirty: true });
                    setValue("gatewayPoolId", newPoolId, { shouldDirty: true });
                  }}
                />
              ) : (
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
                  <TooltipContent>
                    Restricted access. You don&apos;t have permission to attach gateways to
                    resources.
                  </TooltipContent>
                </Tooltip>
              )}
            </Field>
          )}
        </OrgPermissionCan>
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
                      APP_CONNECTION_MAP[AppConnection.KempLoadMaster].name
                    }. This field cannot be changed after creation.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(KempLoadMasterConnectionMethod).map((method) => {
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
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="mb-4">
          <TabsList variant={scopeVariant}>
            <TabsTrigger value="configuration">Configuration</TabsTrigger>
            <TabsTrigger value="ssl">SSL</TabsTrigger>
          </TabsList>
          <TabsContent value="configuration">
            <Controller
              name="credentials.hostname"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="credentials-hostname">Hostname</FieldLabel>
                  <Input
                    id="credentials-hostname"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="e.g. lm.example.com"
                    isError={Boolean(error?.message)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <div className="grid grid-cols-2 gap-2">
              <Controller
                name="credentials.username"
                control={control}
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <Field className="mb-4">
                    <FieldLabel htmlFor="credentials-username">Username</FieldLabel>
                    <Input
                      id="credentials-username"
                      value={value}
                      onChange={(e) => onChange(e.target.value)}
                      placeholder="bal"
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
                    <FieldLabel>Password</FieldLabel>
                    <SecretInput value={value} onChange={(e) => onChange(e.target.value)} />
                    <FieldError errors={[error]} />
                  </Field>
                )}
              />
            </div>
            <Controller
              name="credentials.port"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="credentials-port">
                    Port <span className="text-muted">(optional)</span>
                  </FieldLabel>
                  <Input
                    id="credentials-port"
                    type="number"
                    value={value ?? ""}
                    onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="8443"
                    isError={Boolean(error?.message)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          </TabsContent>
          <TabsContent value="ssl">
            <Controller
              name="credentials.sslCertificate"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="ssl-certificate">
                    SSL Certificate <span className="text-muted">(optional)</span>
                  </FieldLabel>
                  <TextArea
                    id="ssl-certificate"
                    className="h-[3.6rem] resize-none!"
                    {...field}
                    placeholder="-----BEGIN CERTIFICATE----- ... -----END CERTIFICATE-----"
                    isError={Boolean(error?.message)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.sslRejectUnauthorized"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field>
                  <Field orientation="horizontal">
                    <FieldContent>
                      <Label htmlFor="ssl-reject-unauthorized">Reject Unauthorized</Label>
                      <FieldDescription>
                        If enabled, Infisical will only connect to the LoadMaster if it has a valid,
                        trusted SSL certificate. Disable this for self-signed certificates or
                        provide a CA certificate above.
                      </FieldDescription>
                    </FieldContent>
                    <Switch
                      id="ssl-reject-unauthorized"
                      variant={scopeVariant}
                      checked={value}
                      onCheckedChange={onChange}
                    />
                  </Field>
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          </TabsContent>
        </Tabs>
        <AppConnectionFormFooter
          submitLabel={isUpdate ? "Update Credentials" : "Connect to Kemp LoadMaster"}
        />
      </form>
    </FormProvider>
  );
};
