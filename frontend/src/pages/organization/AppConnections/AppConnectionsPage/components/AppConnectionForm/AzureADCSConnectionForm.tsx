import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tab } from "@headlessui/react";
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
  TextArea,
  Tooltip
} from "@app/components/v2";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { AzureADCSConnectionMethod, TAzureADCSConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TAzureADCSConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.AzureADCS)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(AzureADCSConnectionMethod.UsernamePassword),
    credentials: z.object({
      adcsUrl: z
        .string()
        .trim()
        .min(1, "ADCS URL required")
        .refine((value) => value.startsWith("https://"), "ADCS URL must use HTTPS"),
      username: z.string().trim().min(1, "Username required"),
      password: z.string().trim().min(1, "Password required"),
      sslRejectUnauthorized: z.boolean().optional(),
      sslCertificate: z
        .string()
        .trim()
        .transform((value) => value || undefined)
        .optional()
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const AzureADCSConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.AzureADCS,
      method: AzureADCSConnectionMethod.UsernamePassword,
      name: "",
      description: "",
      credentials: {
        adcsUrl: "",
        username: "",
        password: "",
        sslRejectUnauthorized: true,
        sslCertificate: undefined
      }
    }
  });

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isDirty },
    watch
  } = form;

  const sslEnabled = watch("credentials.adcsUrl")?.startsWith("https://") ?? false;

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(e) => {
          setSelectedTabIndex(0);
          handleSubmit(onSubmit)(e);
        }}
      >
        {!isUpdate && <GenericAppConnectionsFields />}
        <Controller
          name="method"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              tooltipText={`The method you would like to use to connect with ${
                APP_CONNECTION_MAP[AppConnection.AzureADCS].name
              }. This field cannot be changed after creation.`}
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Method"
            >
              <Select
                isDisabled={isUpdate}
                value={value}
                onValueChange={(val) => onChange(val)}
                className="border-mineshaft-500 w-full border"
                position="popper"
                dropdownContainerClassName="max-w-none"
              >
                {Object.values(AzureADCSConnectionMethod).map((method) => {
                  return (
                    <SelectItem value={method} key={method}>
                      {getAppConnectionMethodDetails(method).name}
                    </SelectItem>
                  );
                })}
              </Select>
            </FormControl>
          )}
        />
        <Tab.Group selectedIndex={selectedTabIndex} onChange={setSelectedTabIndex}>
          <Tab.List
            className={`-pb-1 ${selectedTabIndex === 1 ? "mb-3" : "mb-6"} border-mineshaft-600 w-full border-b-2`}
          >
            <Tab
              className={({ selected }) =>
                `outline-hidden -mb-[0.14rem] whitespace-nowrap px-4 py-2 text-sm font-medium disabled:opacity-60 ${
                  selected
                    ? "border-mineshaft-300 text-mineshaft-200 border-b-2"
                    : "text-bunker-300"
                }`
              }
            >
              Configuration
            </Tab>
            <Tab
              className={({ selected }) =>
                `outline-hidden -mb-[0.14rem] whitespace-nowrap px-4 py-2 text-sm font-medium disabled:opacity-60 ${
                  selected
                    ? "border-mineshaft-300 text-mineshaft-200 border-b-2"
                    : "text-bunker-300"
                }`
              }
            >
              SSL ({sslEnabled ? "Enabled" : "Disabled"})
            </Tab>
          </Tab.List>
          {selectedTabIndex === 1 && (
            <div className="text-mineshaft-300 mb-2 text-xs">
              SSL configuration for HTTPS connections
            </div>
          )}
          <Tab.Panels className="border-mineshaft-600 bg-mineshaft-700/70 mb-4 rounded-sm border p-3 pb-0">
            <Tab.Panel>
              <Controller
                name="credentials.adcsUrl"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    errorText={error?.message}
                    isError={Boolean(error?.message)}
                    label="ADCS URL"
                  >
                    <Input {...field} placeholder="https://your-adcs-server.com/certsrv" />
                  </FormControl>
                )}
              />
              <div className="grid grid-cols-2 gap-2">
                <Controller
                  name="credentials.username"
                  control={control}
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      errorText={error?.message}
                      isError={Boolean(error?.message)}
                      label="Username"
                    >
                      <Input {...field} placeholder="DOMAIN\\username or user@domain.com" />
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
            </Tab.Panel>
            <Tab.Panel>
              <Controller
                name="credentials.sslCertificate"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    errorText={error?.message}
                    isError={Boolean(error?.message)}
                    className={sslEnabled ? "" : "opacity-50"}
                    label="SSL Certificate"
                    isOptional
                  >
                    <TextArea
                      className="resize-none! h-[3.6rem]"
                      {...field}
                      isDisabled={!sslEnabled}
                      placeholder="-----BEGIN CERTIFICATE-----
...
-----END CERTIFICATE-----"
                    />
                  </FormControl>
                )}
              />
              <Controller
                name="credentials.sslRejectUnauthorized"
                control={control}
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    className={sslEnabled ? "" : "opacity-50"}
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                  >
                    <Switch
                      className="bg-mineshaft-400/50 data-[state=checked]:bg-green/80 shadow-inner"
                      id="ssl-reject-unauthorized"
                      thumbClassName="bg-mineshaft-800"
                      isChecked={sslEnabled ? value : false}
                      onCheckedChange={onChange}
                      isDisabled={!sslEnabled}
                    >
                      <p className="w-38">
                        Reject Unauthorized
                        <Tooltip
                          className="max-w-md"
                          content={
                            <p>
                              If enabled, Infisical will only connect to the ADCS server if it has a
                              valid, trusted SSL certificate. Disable only in test environments with
                              self-signed certificates.
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
            </Tab.Panel>
          </Tab.Panels>
        </Tab.Group>
        <div className="mt-8 flex items-center">
          <Button
            className="mr-4"
            size="sm"
            type="submit"
            colorSchema="secondary"
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
          >
            {isUpdate ? "Update Credentials" : "Connect to Azure ADCS"}
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
