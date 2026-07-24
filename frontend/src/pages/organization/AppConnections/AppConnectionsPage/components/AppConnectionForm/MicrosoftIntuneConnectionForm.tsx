import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  Input,
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
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { useScopeVariant } from "@app/hooks";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  MicrosoftIntuneConnectionMethod,
  TMicrosoftIntuneConnection
} from "@app/hooks/api/appConnections/types/microsoft-intune-connection";

import { useAppConnectionForm } from "./AppConnectionFormContext";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

const formSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.MicrosoftIntune),
  method: z.literal(MicrosoftIntuneConnectionMethod.ClientSecret),
  credentials: z.object({
    tenantId: z.string().trim().min(1, "Tenant ID is required"),
    clientId: z.string().trim().min(1, "Client ID is required"),
    clientSecret: z.string().trim().min(1, "Client Secret is required")
  })
});

type FormData = z.infer<typeof formSchema>;

type Props = {
  appConnection?: TMicrosoftIntuneConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

export const MicrosoftIntuneConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const { onCancel } = useAppConnectionForm();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection
      ? {
          name: appConnection.name,
          description: appConnection.description,
          app: AppConnection.MicrosoftIntune,
          method: MicrosoftIntuneConnectionMethod.ClientSecret,
          credentials: {
            tenantId: appConnection.credentials.tenantId,
            clientId: appConnection.credentials.clientId,
            clientSecret: ""
          }
        }
      : {
          app: AppConnection.MicrosoftIntune,
          method: MicrosoftIntuneConnectionMethod.ClientSecret,
          credentials: {
            tenantId: "",
            clientId: "",
            clientSecret: ""
          }
        }
  });

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isDirty }
  } = form;

  const scopeVariant = useScopeVariant();

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {!isUpdate && <GenericAppConnectionsFields />}

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
                    The method you would like to use to connect with{" "}
                    {APP_CONNECTION_MAP[AppConnection.MicrosoftIntune].name}. This field cannot be
                    changed after creation.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger id="method" className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(MicrosoftIntuneConnectionMethod).map((method) => {
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
          name="credentials.tenantId"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="credentials.tenantId">
                Tenant ID
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The Microsoft Entra (Azure AD) Tenant ID of the application.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                {...field}
                id="credentials.tenantId"
                placeholder="00000000-0000-0000-0000-000000000000"
                isError={Boolean(error)}
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
              <FieldLabel htmlFor="credentials.clientId">
                Client ID
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The Application (Client) ID of the Entra app registration granted the Intune
                    SCEP challenge validation permission.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                {...field}
                id="credentials.clientId"
                placeholder="00000000-0000-0000-0000-000000000000"
                isError={Boolean(error)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />

        <Controller
          name="credentials.clientSecret"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="credentials.clientSecret">
                Client Secret
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The client secret of the Entra app registration.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                {...field}
                id="credentials.clientSecret"
                type="password"
                placeholder="~JzD8e6S.tH~w8XRaNnKcb7W1fM4rCns7FY"
                isError={Boolean(error)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />

        <SheetFooter className="sticky bottom-0 -mx-4 items-center border-t bg-popover">
          <Button
            type="submit"
            variant={scopeVariant}
            isPending={isSubmitting}
            isDisabled={isSubmitting || (!isUpdate && !isDirty)}
          >
            {isUpdate ? "Reconnect to Microsoft Intune" : "Connect to Microsoft Intune"}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} isDisabled={isSubmitting}>
            Cancel
          </Button>
        </SheetFooter>
      </form>
    </FormProvider>
  );
};
