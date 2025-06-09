import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  Button,
  FormControl,
  Input,
  ModalClose,
  SecretInput,
  Select,
  SelectItem
} from "@app/components/v2";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { OCIConnectionMethod, TOCIConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

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

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isDirty }
  } = form;

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {!isUpdate && <GenericAppConnectionsFields />}
        <Controller
          name="method"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              tooltipText={`The method you would like to use to connect with ${
                APP_CONNECTION_MAP[AppConnection.OCI].name
              }. This field cannot be changed after creation.`}
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Method"
            >
              <Select
                isDisabled={isUpdate}
                value={value}
                onValueChange={(val) => onChange(val)}
                className="w-full border border-mineshaft-500"
                position="popper"
                dropdownContainerClassName="max-w-none"
              >
                {Object.values(OCIConnectionMethod).map((method) => {
                  return (
                    <SelectItem value={method} key={method}>
                      {getAppConnectionMethodDetails(method).name}{" "}
                    </SelectItem>
                  );
                })}
              </Select>
            </FormControl>
          )}
        />
        <Controller
          name="credentials.userOcid"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="User OCID"
              tooltipClassName="max-w-sm"
              tooltipText="The unique identifier (OCID) associated with your OCI user account. You can find this in your OCI console under Identity > Domains > [domain] > Users > [user]."
            >
              <Input
                {...field}
                placeholder="ocid1.user.oc1..************************************************************"
              />
            </FormControl>
          )}
        />
        <Controller
          name="credentials.tenancyOcid"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Tenancy OCID"
              tooltipClassName="max-w-sm"
              tooltipText="The unique identifier (OCID) for your tenancy in Oracle Cloud. You can find this in your OCI console under Administration > Tenancy Details."
            >
              <Input
                {...field}
                placeholder="ocid1.tenancy.oc1..************************************************************"
              />
            </FormControl>
          )}
        />
        <Controller
          name="credentials.region"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Region"
              tooltipClassName="max-w-sm"
              tooltipText="The OCI region where your resources are located (e.g., us-ashburn-1, eu-frankfurt-1)."
            >
              <Input {...field} placeholder="us-ashburn-1" />
            </FormControl>
          )}
        />
        <Controller
          name="credentials.fingerprint"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Fingerprint"
              tooltipClassName="max-w-sm"
              tooltipText="The fingerprint of the public key associated with your OCI API key. This is generated when you create an API key in your OCI user settings."
            >
              <Input {...field} placeholder="00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00" />
            </FormControl>
          )}
        />
        <Controller
          name="credentials.privateKey"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Private Key PEM"
            >
              <SecretInput
                containerClassName="text-gray-400 group-focus-within:!border-primary-400/50 border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
            </FormControl>
          )}
        />
        <div className="mt-8 flex items-center">
          <Button
            className="mr-4"
            size="sm"
            type="submit"
            colorSchema="secondary"
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
          >
            {isUpdate ? "Update Credentials" : "Connect to OCI"}
          </Button>
          <ModalClose asChild>
            <Button colorSchema="secondary" variant="plain">
              Cancel
            </Button>
          </ModalClose>
        </div>
      </form>
    </FormProvider>
  );
};
