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
import { DistinguishedNameRegex } from "@app/helpers/string";
import {
  LdapConnectionMethod,
  LdapConnectionProvider,
  TLdapConnection
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TLdapConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.LDAP)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(LdapConnectionMethod.SimpleBind),
    credentials: z.object({
      provider: z.nativeEnum(LdapConnectionProvider),
      url: z
        .string()
        .regex(/^ldaps?:\/\//, 'Must start with "ldaps://" or "ldap://"')
        .url()
        .trim()
        .min(1, "LDAP URL required"),
      dn: z
        .string()
        .trim()
        .regex(DistinguishedNameRegex, "Invalid Distinguished Name format")
        .min(1, "Distinguished Name (DN) required"),
      password: z.string().trim().min(1, "Password required"),
      sslRejectUnauthorized: z.boolean(),
      sslCertificate: z
        .string()
        .trim()
        .transform((value) => value || undefined)
        .optional()
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const LdapConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.LDAP,
      method: LdapConnectionMethod.SimpleBind,
      credentials: {
        provider: LdapConnectionProvider.ActiveDirectory,
        url: "",
        dn: "",
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

  const selectedProvider = watch("credentials.provider");
  const sslEnabled = watch("credentials.url")?.startsWith("ldaps://") ?? false;

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(e) => {
          setSelectedTabIndex(0);
          handleSubmit(onSubmit)(e);
        }}
      >
        {!isUpdate && <GenericAppConnectionsFields />}
        <div className="grid grid-cols-2 items-center gap-2">
          <Controller
            name="method"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                tooltipText={`The method you would like to use to connect with ${
                  APP_CONNECTION_MAP[AppConnection.LDAP].name
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
                  {Object.values(LdapConnectionMethod).map((method) => {
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
          <Controller
            name="credentials.provider"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error?.message)}
                label="LDAP Provider"
              >
                <Select
                  isDisabled={isUpdate}
                  value={value}
                  onValueChange={(val) => onChange(val)}
                  className="w-full border border-mineshaft-500 capitalize"
                  position="popper"
                  dropdownContainerClassName="max-w-none"
                >
                  {Object.values(LdapConnectionProvider).map((provider) => {
                    return (
                      <SelectItem value={provider} className="capitalize" key={provider}>
                        {provider.replace("-", " ")}
                      </SelectItem>
                    );
                  })}
                </Select>
              </FormControl>
            )}
          />
        </div>
        <Tab.Group selectedIndex={selectedTabIndex} onChange={setSelectedTabIndex}>
          <Tab.List
            className={`-pb-1 ${selectedTabIndex === 1 ? "mb-3" : "mb-6"} w-full border-b-2 border-mineshaft-600`}
          >
            <Tab
              className={({ selected }) =>
                `w-30 -mb-[0.14rem] px-4 py-2 text-sm font-medium outline-none disabled:opacity-60 ${
                  selected
                    ? "border-b-2 border-mineshaft-300 text-mineshaft-200"
                    : "text-bunker-300"
                }`
              }
            >
              Configuration
            </Tab>
            <Tab
              className={({ selected }) =>
                `w-30 -mb-[0.14rem] px-4 py-2 text-sm font-medium outline-none disabled:opacity-60 ${
                  selected
                    ? "border-b-2 border-mineshaft-300 text-mineshaft-200"
                    : "text-bunker-300"
                }`
              }
            >
              SSL ({sslEnabled ? "Enabled" : "Disabled"})
            </Tab>
          </Tab.List>
          {selectedTabIndex === 1 && (
            <div className="mb-2 text-xs text-mineshaft-300">Requires ldaps:// URL</div>
          )}
          <Tab.Panels className="mb-4 rounded border border-mineshaft-600 bg-mineshaft-700/70 p-3 pb-0">
            <Tab.Panel>
              <Controller
                name="credentials.url"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    errorText={error?.message}
                    isError={Boolean(error?.message)}
                    label="LDAP URL"
                  >
                    <Input {...field} placeholder="ldap://domain-or-ip:389" />
                  </FormControl>
                )}
              />
              <div className="grid grid-cols-2 gap-2">
                <Controller
                  name="credentials.dn"
                  control={control}
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      errorText={error?.message}
                      isError={Boolean(error?.message)}
                      label="Binding Distinguished Name (DN)"
                    >
                      <Input {...field} placeholder="CN=John,OU=Users,DC=example,DC=com" />
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
                      label="Binding Password"
                    >
                      <SecretInput
                        containerClassName="text-gray-400 group-focus-within:!border-primary-400/50 border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
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
                      className="h-[3.6rem] !resize-none"
                      {...field}
                      isDisabled={!sslEnabled}
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
                      className="bg-mineshaft-400/50 shadow-inner data-[state=checked]:bg-green/80"
                      id="ssl-reject-unauthorized"
                      thumbClassName="bg-mineshaft-800"
                      isChecked={sslEnabled ? value : false}
                      onCheckedChange={onChange}
                      isDisabled={!sslEnabled}
                    >
                      <p className="w-[9.5rem]">
                        Reject Unauthorized
                        <Tooltip
                          className="max-w-md"
                          content={
                            <p>
                              If enabled, Infisical will only connect to the server if it has a
                              valid, trusted SSL certificate.
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
            className="mr-4 capitalize"
            size="sm"
            type="submit"
            colorSchema="secondary"
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
          >
            {isUpdate ? "Update Credentials" : `Connect to ${selectedProvider.replace("-", " ")}`}
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
