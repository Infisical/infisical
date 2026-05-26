import { Controller, FormProvider, useForm } from "react-hook-form";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  Button,
  FormControl,
  Input,
  ModalClose,
  SecretInput,
  Select,
  SelectItem,
  Switch,
  Tooltip
} from "@app/components/v2";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import {
  NutanixPrismCentralConnectionMethod,
  TNutanixPrismCentralConnection
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TNutanixPrismCentralConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.NutanixPrismCentral)
});

const credentialsBase = z.object({
  hostname: z
    .string()
    .trim()
    .min(1, "Hostname is required")
    .max(512, "Hostname cannot exceed 512 characters"),
  port: z
    .union([z.coerce.number().int().min(1).max(65535), z.literal("")])
    .optional()
    .transform((val) => (val === "" ? undefined : val)),
  sslRejectUnauthorized: z.boolean()
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(NutanixPrismCentralConnectionMethod.ApiKey),
    credentials: credentialsBase.extend({
      apiKey: z
        .string()
        .trim()
        .min(1, "API Key is required")
        .max(1024, "API Key cannot exceed 1024 characters")
    })
  }),
  rootSchema.extend({
    method: z.literal(NutanixPrismCentralConnectionMethod.BasicAuth),
    credentials: credentialsBase.extend({
      username: z
        .string()
        .trim()
        .min(1, "Username is required")
        .max(256, "Username cannot exceed 256 characters"),
      password: z
        .string()
        .trim()
        .min(1, "Password is required")
        .max(512, "Password cannot exceed 512 characters")
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const NutanixPrismCentralConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.NutanixPrismCentral,
      method: NutanixPrismCentralConnectionMethod.BasicAuth,
      credentials: {
        sslRejectUnauthorized: true
      }
    }
  });

  const {
    handleSubmit,
    control,
    watch,
    formState: { isSubmitting, isDirty }
  } = form;

  const method = watch("method");

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {!isUpdate && <GenericAppConnectionsFields />}
        <Controller
          name="method"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              tooltipText={`The authentication method to use when connecting to ${APP_CONNECTION_MAP[AppConnection.NutanixPrismCentral].name}. This field cannot be changed after creation.`}
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
                {Object.values(NutanixPrismCentralConnectionMethod).map((m) => (
                  <SelectItem value={m} key={m}>
                    {getAppConnectionMethodDetails(m).name}
                  </SelectItem>
                ))}
              </Select>
            </FormControl>
          )}
        />
        <div className="mb-4 rounded-sm border border-mineshaft-600 bg-mineshaft-700/70 p-3">
          <Controller
            name="credentials.hostname"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error?.message)}
                label="Hostname"
                tooltipText="The FQDN or IP address of your Nutanix Prism Central instance."
              >
                <Input
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder="e.g. prism.example.com"
                />
              </FormControl>
            )}
          />
          <Controller
            name="credentials.port"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error?.message)}
                label="Port"
                isOptional
                tooltipText="The HTTPS port for Prism Central. Default is 9440."
              >
                <Input
                  type="number"
                  value={value ?? ""}
                  onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="9440"
                />
              </FormControl>
            )}
          />
          {method === NutanixPrismCentralConnectionMethod.ApiKey && (
            <Controller
              name="credentials.apiKey"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  errorText={error?.message}
                  isError={Boolean(error?.message)}
                  label="API Key"
                  tooltipText="A Nutanix API key with permission to manage SSL certificates."
                >
                  <SecretInput
                    containerClassName="text-gray-400 group-focus-within:border-primary-400/50! border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                  />
                </FormControl>
              )}
            />
          )}
          {method === NutanixPrismCentralConnectionMethod.BasicAuth && (
            <div className="grid grid-cols-2 gap-2">
              <Controller
                name="credentials.username"
                control={control}
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    errorText={error?.message}
                    isError={Boolean(error?.message)}
                    label="Username"
                  >
                    <Input
                      value={value}
                      onChange={(e) => onChange(e.target.value)}
                      placeholder="admin"
                    />
                  </FormControl>
                )}
              />
              <Controller
                name="credentials.password"
                control={control}
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    errorText={error?.message}
                    isError={Boolean(error?.message)}
                    label="Password"
                  >
                    <SecretInput
                      containerClassName="text-gray-400 group-focus-within:border-primary-400/50! border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
                      value={value}
                      onChange={(e) => onChange(e.target.value)}
                    />
                  </FormControl>
                )}
              />
            </div>
          )}
          <Controller
            name="credentials.sslRejectUnauthorized"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl isError={Boolean(error?.message)} errorText={error?.message}>
                <Switch
                  className="bg-mineshaft-400/50 shadow-inner data-[state=checked]:bg-green/80"
                  id="ssl-reject-unauthorized"
                  thumbClassName="bg-mineshaft-800"
                  isChecked={value}
                  onCheckedChange={onChange}
                >
                  <p className="w-44">
                    Reject Unauthorized SSL
                    <Tooltip
                      className="max-w-md"
                      content={
                        <p>
                          If enabled, Infisical will only connect if Prism Central presents a valid,
                          trusted SSL certificate. Disable for self-signed certificates.
                        </p>
                      }
                    >
                      <FontAwesomeIcon icon={faQuestionCircle} size="sm" className="ml-1" />
                    </Tooltip>
                  </p>
                </Switch>
              </FormControl>
            )}
          />
        </div>
        <div className="mt-8 flex items-center">
          <Button
            className="mr-4"
            size="sm"
            type="submit"
            colorSchema="secondary"
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
          >
            {isUpdate ? "Update Credentials" : "Connect to Nutanix Prism Central"}
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
