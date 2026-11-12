import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Field,
  FieldError,
  FieldLabel,
  Input,
  SecretInput,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { GatewayPicker } from "@app/components/v3/platform/GatewayPicker";
import { OrgPermissionSubjects, useSubscription } from "@app/context";
import { OrgGatewayPermissionActions } from "@app/context/OrgPermissionContext/types";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { SmbConnectionMethod, TSmbConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { smbConnectionFormSchema as formSchema } from "@app/lib/schemas/app-connections";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import { GenericAppConnectionsFields } from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TSmbConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

type FormData = z.infer<typeof formSchema>;

export const SmbConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection
      ? {
          ...appConnection,
          credentials: {
            ...appConnection.credentials,
            password: ""
          }
        }
      : {
          app: AppConnection.SMB,
          method: SmbConnectionMethod.Credentials,
          gatewayId: null,
          gatewayPoolId: null,
          credentials: {
            host: "",
            port: 445,
            domain: "",
            username: "",
            password: ""
          }
        }
  });

  const { handleSubmit, control, setValue, watch } = form;

  const gatewayId = watch("gatewayId");
  const gatewayPoolId = watch("gatewayPoolId");
  const { subscription } = useSubscription();

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {!isUpdate && <GenericAppConnectionsFields />}
        {subscription.gateway && (
          <OrgPermissionCan
            I={OrgGatewayPermissionActions.AttachGateways}
            a={OrgPermissionSubjects.Gateway}
          >
            {(isAllowed) => {
              const picker = (
                <div>
                  <GatewayPicker
                    isDisabled={!isAllowed}
                    value={{ gatewayId: gatewayId ?? null, gatewayPoolId: gatewayPoolId ?? null }}
                    onChange={({ gatewayId: newGwId, gatewayPoolId: newPoolId }) => {
                      setValue("gatewayId", newGwId, { shouldDirty: true });
                      setValue("gatewayPoolId", newPoolId, { shouldDirty: true });
                    }}
                  />
                </div>
              );

              return (
                <Field className="mb-4">
                  <FieldLabel htmlFor="gateway">Gateway</FieldLabel>
                  {isAllowed ? (
                    picker
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>{picker}</TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        Restricted access. You don&apos;t have permission to attach gateways to
                        resources.
                      </TooltipContent>
                    </Tooltip>
                  )}
                </Field>
              );
            }}
          </OrgPermissionCan>
        )}
        <Controller
          name="credentials.host"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="host">Host</FieldLabel>
              <Input
                id="host"
                {...field}
                placeholder="Hostname or IP address of Windows server"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.port"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="port">Port</FieldLabel>
              <Input
                id="port"
                type="number"
                value={value}
                onChange={(e) => onChange(e.target.value ? Number(e.target.value) : 445)}
                placeholder="445"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.domain"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="domain">
                Domain <span className="text-muted">(optional)</span>
              </FieldLabel>
              <Input
                id="domain"
                {...field}
                placeholder="e.g., MYDOMAIN (for domain-joined servers)"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.username"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="username">Username</FieldLabel>
              <Input
                id="username"
                {...field}
                placeholder="Administrator"
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
              <SecretInput
                aria-describedby={error ? "password-error" : undefined}
                id="password"
                isError={Boolean(error)}
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
              <FieldError id="password-error" errors={[error]} />
            </Field>
          )}
        />
        <AppConnectionFormFooter
          submitLabel={
            isUpdate
              ? "Update Credentials"
              : `Connect to ${APP_CONNECTION_MAP[AppConnection.SMB].name}`
          }
        />
      </form>
    </FormProvider>
  );
};
