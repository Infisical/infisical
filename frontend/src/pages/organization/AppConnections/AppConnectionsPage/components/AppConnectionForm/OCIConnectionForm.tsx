import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import {
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
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { OCIConnectionMethod, TOCIConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TOCIConnection;
  onSubmit: (formData: FormData) => void;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.OCI)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(OCIConnectionMethod.AccessKey),
    credentials: z.object({
      userOcid: z
        .string()
        .trim()
        .min(1, "User OCID required")
        .regex(/^ocid1\.user\.oc1\.\..+$/, "Invalid User OCID format"),
      tenancyOcid: z
        .string()
        .trim()
        .min(1, "Tenancy OCID required")
        .regex(/^ocid1\.tenancy\.oc1\.\..+$/, "Invalid Tenancy OCID format"),
      region: z.string().trim().min(1, "Region required"),
      fingerprint: z.string().trim().min(1, "Fingerprint required"),
      privateKey: z.string().trim().min(1, "Private Key required")
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const OCIConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.OCI,
      method: OCIConnectionMethod.AccessKey
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
              <FieldLabel>
                Method
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    {`The method you would like to use to connect with ${
                      APP_CONNECTION_MAP[AppConnection.OCI].name
                    }. This field cannot be changed after creation.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(OCIConnectionMethod).map((method) => {
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
          name="credentials.userOcid"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="credentials-user-ocid">
                User OCID
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The unique identifier (OCID) associated with your OCI user account. You can find
                    this in your OCI console under Identity &gt; Domains &gt; [domain] &gt; Users
                    &gt; [user].
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                id="credentials-user-ocid"
                {...field}
                placeholder="ocid1.user.oc1..************************************************************"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.tenancyOcid"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="credentials-tenancy-ocid">
                Tenancy OCID
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The unique identifier (OCID) for your tenancy in Oracle Cloud. You can find this
                    in your OCI console under Administration &gt; Tenancy Details.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                id="credentials-tenancy-ocid"
                {...field}
                placeholder="ocid1.tenancy.oc1..************************************************************"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.region"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="credentials-region">
                Region
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The OCI region where your resources are located (e.g., us-ashburn-1,
                    eu-frankfurt-1).
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                id="credentials-region"
                {...field}
                placeholder="us-ashburn-1"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.fingerprint"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="credentials-fingerprint">
                Fingerprint
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The fingerprint of the public key associated with your OCI API key. This is
                    generated when you create an API key in your OCI user settings.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                id="credentials-fingerprint"
                {...field}
                placeholder="00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.privateKey"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel>Private Key PEM</FieldLabel>
              <SecretInput value={value} onChange={(e) => onChange(e.target.value)} />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <AppConnectionFormFooter submitLabel={isUpdate ? "Update Credentials" : "Connect to OCI"} />
      </form>
    </FormProvider>
  );
};
