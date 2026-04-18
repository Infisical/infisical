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
import { TPowerDNSConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { PowerDNSConnectionMethod } from "@app/hooks/api/appConnections/types/powerdns-connection";

import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TPowerDNSConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.PowerDNS)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(PowerDNSConnectionMethod.APIKey),
    credentials: z.object({
      apiKey: z.string().trim().min(1, "API Key required"),
      baseUrl: z.string().trim().url("Must be a valid URL").min(1, "Base URL required")
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const PowerDNSConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.PowerDNS,
      method: PowerDNSConnectionMethod.APIKey,
      credentials: {
        apiKey: "",
        baseUrl: ""
      }
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
                APP_CONNECTION_MAP[AppConnection.PowerDNS].name
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
                {Object.values(PowerDNSConnectionMethod).map((method) => (
                  <SelectItem value={method} key={method}>
                    {getAppConnectionMethodDetails(method).name}
                  </SelectItem>
                ))}
              </Select>
            </FormControl>
          )}
        />
        <Controller
          name="credentials.baseUrl"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Base URL"
              tooltipText="The base URL of your PowerDNS API. For PowerDNS-Admin proxy: https://powerdns-admin/api/v1. For direct server access: https://your-powerdns-server"
            >
              <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="https://powerdns-admin/api/v1"
              />
            </FormControl>
          )}
        />
        <Controller
          name="credentials.apiKey"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="API Key"
            >
              <SecretInput
                containerClassName="text-gray-400 group-focus-within:border-primary-400/50! border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
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
            {isUpdate ? "Update Credentials" : "Connect to PowerDNS"}
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
