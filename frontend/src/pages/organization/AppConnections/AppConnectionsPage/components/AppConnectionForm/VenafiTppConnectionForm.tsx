import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
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
  SheetFooter,
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
import { useScopeVariant } from "@app/hooks";
import { TVenafiTppConnection, VenafiTppConnectionMethod } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { useAppConnectionForm } from "./AppConnectionFormContext";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TVenafiTppConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.VenafiTpp)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(VenafiTppConnectionMethod.OAuth),
    credentials: z.object({
      tppUrl: z
        .string()
        .trim()
        .min(1, "TPP URL required")
        .refine((value) => value.startsWith("https://"), "TPP URL must use HTTPS"),
      clientId: z.string().trim().min(1, "Client ID required"),
      username: z.string().trim().min(1, "Username required"),
      password: z.string().trim().min(1, "Password required")
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const VenafiTppConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const { onCancel } = useAppConnectionForm();
  const scopeVariant = useScopeVariant();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.VenafiTpp,
      method: VenafiTppConnectionMethod.OAuth,
      name: "",
      description: "",
      gatewayId: null,
      gatewayPoolId: null,
      credentials: {
        tppUrl: "",
        clientId: "",
        username: "",
        password: ""
      }
    }
  });

  const {
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { isSubmitting, isDirty }
  } = form;

  const gatewayId = watch("gatewayId");
  const gatewayPoolId = watch("gatewayPoolId");
  const { subscription } = useSubscription();

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
                    The method you would like to use to connect with{" "}
                    {APP_CONNECTION_MAP[AppConnection.VenafiTpp].name}. This field cannot be changed
                    after creation.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error?.message)}>
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(VenafiTppConnectionMethod).map((method) => (
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
          name="credentials.tppUrl"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="venafi-tpp-url">TPP URL</FieldLabel>
              <Input
                id="venafi-tpp-url"
                {...field}
                placeholder="https://tpp.example.com"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.clientId"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="venafi-client-id">
                Client ID
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The OAuth Client ID registered in the Venafi TPP API Integration.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                id="venafi-client-id"
                {...field}
                placeholder="my-infisical-integration"
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
            render={({ field, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel htmlFor="venafi-username">Username</FieldLabel>
                <Input
                  id="venafi-username"
                  {...field}
                  placeholder="admin@domain.com"
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
        <SheetFooter className="sticky bottom-0 -mx-4 items-center border-t bg-popover">
          <Button
            type="submit"
            variant={scopeVariant}
            isPending={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
          >
            {isUpdate ? "Update Credentials" : "Connect to Venafi TPP"}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} isDisabled={isSubmitting}>
            Cancel
          </Button>
        </SheetFooter>
      </form>
    </FormProvider>
  );
};
