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
import { AdcsConnectionMethod, TAdcsConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TAdcsConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.ADCS)
});

const formSchema = z
  .discriminatedUnion("method", [
    rootSchema.extend({
      method: z.literal(AdcsConnectionMethod.UsernamePassword),
      credentials: z.object({
        host: z.string().trim().min(1, "CA Host required"),
        username: z.string().trim().min(1, "Username required"),
        password: z.string().trim().min(1, "Password required")
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

export const AdcsConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.ADCS,
      method: AdcsConnectionMethod.UsernamePassword,
      gatewayId: null,
      gatewayPoolId: null,
      credentials: {
        host: "",
        username: "",
        password: ""
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
                      APP_CONNECTION_MAP[AppConnection.ADCS].name
                    }. This field cannot be changed after creation.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(AdcsConnectionMethod).map((method) => {
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
                  {isAllowed ? (
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
                  ) : (
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
                      <TooltipContent>
                        Restricted access. You don&apos;t have permission to attach gateways to
                        resources.
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          )}
        </OrgPermissionCan>
        <Controller
          name="credentials.host"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="ca-host">CA Host</FieldLabel>
              <Input
                id="ca-host"
                {...field}
                placeholder="ca01.corp.example.com"
                isError={Boolean(error?.message)}
              />
              <FieldDescription>The CA server&apos;s DNS name, not a URL</FieldDescription>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
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
        <AppConnectionFormFooter
          submitLabel={isUpdate ? "Update Credentials" : "Connect to ADCS"}
        />
      </form>
    </FormProvider>
  );
};
