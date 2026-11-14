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
import { ImpervaConnectionMethod, TImpervaConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { impervaConnectionFormSchema as formSchema } from "@app/lib/schemas/app-connections";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import { GenericAppConnectionsFields } from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TImpervaConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

type FormData = z.infer<typeof formSchema>;

export const ImpervaConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.Imperva,
      method: ImpervaConnectionMethod.ApiKey,
      gatewayId: null,
      gatewayPoolId: null
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
              <FieldDescription>
                Optional. Route Imperva API calls through a gateway when outbound traffic must leave
                from a fixed network.
              </FieldDescription>
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
                      APP_CONNECTION_MAP[AppConnection.Imperva].name
                    }. This field cannot be changed after creation.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(ImpervaConnectionMethod).map((method) => {
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
        <Controller
          name="credentials.apiId"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="credentials-api-id">API ID</FieldLabel>
              <Input
                id="credentials-api-id"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="e.g. 12345"
                isError={Boolean(error?.message)}
              />
              <FieldDescription>
                Found in the Imperva Cloud Security Console under Account Management &gt; User
                Management &gt; My Profile.
              </FieldDescription>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.apiKey"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="credentials-api-key">API Key</FieldLabel>
              <SecretInput
                id="credentials-api-key"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                isError={Boolean(error?.message)}
              />
              <FieldDescription>
                Imperva creates keys disabled, so switch the key on after creating it. Its role also
                needs the Manage SSL Certificates permission.
              </FieldDescription>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.accountId"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="credentials-account-id">
                Account ID <span className="text-muted">(optional)</span>
              </FieldLabel>
              <Input
                id="credentials-account-id"
                value={value ?? ""}
                onChange={(e) => onChange(e.target.value)}
                placeholder="e.g. 678901"
                isError={Boolean(error?.message)}
              />
              <FieldDescription>
                Set this to manage websites that belong to a sub-account. Defaults to the account
                the API key belongs to.
              </FieldDescription>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <AppConnectionFormFooter
          submitLabel={isUpdate ? "Update Credentials" : "Connect to Imperva"}
        />
      </form>
    </FormProvider>
  );
};
