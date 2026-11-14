import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import {
  Field,
  FieldError,
  FieldLabel,
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
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  OnaConnectionMethod,
  TOnaConnection
} from "@app/hooks/api/appConnections/types/ona-connection";
import { onaConnectionFormSchema as formSchema } from "@app/lib/schemas/app-connections";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import { GenericAppConnectionsFields } from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TOnaConnection;
  onSubmit: (formData: FormData) => void;
};

type FormData = z.infer<typeof formSchema>;

export const OnaConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.Ona,
      method: OnaConnectionMethod.PersonalAccessToken
    }
  });

  const { handleSubmit, control } = form;

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
                    {APP_CONNECTION_MAP[AppConnection.Ona].name}. This field cannot be changed after
                    creation.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error)} id="method">
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(OnaConnectionMethod).map((method) => {
                    return (
                      <SelectItem value={method} key={method}>
                        {getAppConnectionMethodDetails(method).name}{" "}
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
          name="credentials.personalAccessToken"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="personal-access-token">Personal Access Token</FieldLabel>
              <SecretInput
                aria-describedby={error ? "personal-access-token-error" : undefined}
                id="personal-access-token"
                isError={Boolean(error)}
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
              <FieldError id="personal-access-token-error" errors={[error]} />
            </Field>
          )}
        />
        <AppConnectionFormFooter submitLabel={isUpdate ? "Update Credentials" : "Connect to Ona"} />
      </form>
    </FormProvider>
  );
};
