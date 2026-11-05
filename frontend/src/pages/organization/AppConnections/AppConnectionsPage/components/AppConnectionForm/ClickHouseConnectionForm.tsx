import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Field,
  FieldError,
  FieldLabel,
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
import { useSubscription } from "@app/context";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { ClickHouseConnectionMethod, TClickHouseConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";
import { BaseSqlUsernameAndPasswordConnectionSchema, SqlConnectionFields } from "./shared";

type Props = {
  appConnection?: TClickHouseConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.ClickHouse)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(ClickHouseConnectionMethod.UsernameAndPassword),
    credentials: BaseSqlUsernameAndPasswordConnectionSchema
  })
]);

type FormData = z.infer<typeof formSchema>;

export const ClickHouseConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.ClickHouse,
      method: ClickHouseConnectionMethod.UsernameAndPassword,
      gatewayId: null,
      gatewayPoolId: null,
      credentials: {
        host: "",
        port: 8443,
        database: "default",
        username: "",
        password: "",
        sslEnabled: true,
        sslRejectUnauthorized: true,
        sslCertificate: undefined
      }
    }
  });

  const { handleSubmit, control, setValue, watch } = form;

  const { subscription } = useSubscription();
  const gatewayId = watch("gatewayId");
  const gatewayPoolId = watch("gatewayPoolId");

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(e) => {
          setSelectedTabIndex(0);
          handleSubmit(onSubmit)(e);
        }}
      >
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
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel>
                Method
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The method you would like to use to connect with{" "}
                    {APP_CONNECTION_MAP[AppConnection.ClickHouse].name}. This field cannot be
                    changed after creation.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error?.message)}>
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(ClickHouseConnectionMethod).map((method) => (
                    <SelectItem value={method} key={method}>
                      {getAppConnectionMethodDetails(method).name}{" "}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <SqlConnectionFields
          isPlatformManagedCredentials={false}
          supportsPlatformManagedCredentials={false}
          selectedTabIndex={selectedTabIndex}
          setSelectedTabIndex={setSelectedTabIndex}
        />
        <AppConnectionFormFooter
          submitLabel={isUpdate ? "Update Credentials" : "Connect to Database"}
        />
      </form>
    </FormProvider>
  );
};
