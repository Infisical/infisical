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
import { MongoDBConnectionMethod, TMongoDBConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TMongoDBConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.MongoDB)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(MongoDBConnectionMethod.UsernameAndPassword),
    credentials: z.object({
      host: z.string().trim().min(1, "Host required"),
      port: z.coerce.number().default(27017),
      username: z.string().trim().min(1, "Username required"),
      password: z.string().trim().min(1, "Password required"),
      database: z.string().trim().min(1, "Database required"),
      tlsEnabled: z.boolean().default(false),
      tlsRejectUnauthorized: z.boolean().default(true),
      tlsCertificate: z
        .string()
        .trim()
        .transform((value) => value || undefined)
        .optional()
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const MongoDBConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.MongoDB,
      method: MongoDBConnectionMethod.UsernameAndPassword,
      credentials: {
        host: "",
        port: 27017,
        username: "",
        password: "",
        database: "",
        tlsEnabled: false,
        tlsRejectUnauthorized: true,
        tlsCertificate: undefined
      }
    }
  });

  const {
    handleSubmit,
    watch,
    control,
    formState: { isSubmitting, isDirty }
  } = form;

  const tlsEnabled = watch("credentials.tlsEnabled");

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
                APP_CONNECTION_MAP[AppConnection.MongoDB].name
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
                {Object.values(MongoDBConnectionMethod).map((method) => {
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

        <Tab.Group selectedIndex={selectedTabIndex} onChange={setSelectedTabIndex}>
          <Tab.List className="-pb-1 mb-6 w-full border-b-2 border-mineshaft-600">
            <Tab
              className={({ selected }) =>
                `-mb-[0.14rem] px-4 py-2 text-sm font-medium whitespace-nowrap outline-hidden disabled:opacity-60 ${
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
                `-mb-[0.14rem] px-4 py-2 text-sm font-medium whitespace-nowrap outline-hidden disabled:opacity-60 ${
                  selected
                    ? "border-b-2 border-mineshaft-300 text-mineshaft-200"
                    : "text-bunker-300"
                }`
              }
            >
              TLS ({tlsEnabled ? "Enabled" : "Disabled"})
            </Tab>
          </Tab.List>
          <Tab.Panels className="mb-4 rounded-sm border border-mineshaft-600 bg-mineshaft-700/70 p-3 pb-0">
            <Tab.Panel>
              <div className="mt-[0.675rem] flex items-start gap-2">
                <Controller
                  name="credentials.host"
                  control={control}
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      className="flex-1"
                      errorText={error?.message}
                      isError={Boolean(error?.message)}
                      label="Host"
                    >
                      <Input {...field} />
                    </FormControl>
                  )}
                />
                <Controller
                  name="credentials.database"
                  control={control}
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      className="flex-1"
                      errorText={error?.message}
                      isError={Boolean(error?.message)}
                      label="Database"
                    >
                      <Input {...field} />
                    </FormControl>
                  )}
                />
                <Controller
                  name="credentials.port"
                  control={control}
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      className="w-28"
                      errorText={error?.message}
                      isError={Boolean(error?.message)}
                      label="Port"
                    >
                      <Input type="number" {...field} />
                    </FormControl>
                  )}
                />
              </div>
              <div className="mb-[0.675rem] flex items-start gap-2">
                <Controller
                  name="credentials.username"
                  control={control}
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      errorText={error?.message}
                      isError={Boolean(error?.message)}
                      label="Username"
                      className="flex-1"
                    >
                      <Input {...field} />
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
                      className="flex-1"
                    >
                      <SecretInput
                        containerClassName="text-gray-400 w-full group-focus-within:border-primary-400/50! border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
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
                name="credentials.tlsEnabled"
                control={control}
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl isError={Boolean(error?.message)} errorText={error?.message}>
                    <Switch
                      className="bg-mineshaft-400/50 shadow-inner data-[state=checked]:bg-green/80"
                      id="tls-enabled"
                      thumbClassName="bg-mineshaft-800"
                      isChecked={value}
                      onCheckedChange={onChange}
                    >
                      Enable TLS
                    </Switch>
                  </FormControl>
                )}
              />
              <Controller
                name="credentials.tlsCertificate"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    errorText={error?.message}
                    isError={Boolean(error?.message)}
                    className={tlsEnabled ? "" : "opacity-50"}
                    label="TLS Certificate"
                    isOptional
                  >
                    <TextArea className="h-14 resize-none!" {...field} isDisabled={!tlsEnabled} />
                  </FormControl>
                )}
              />
              <Controller
                name="credentials.tlsRejectUnauthorized"
                control={control}
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    className={tlsEnabled ? "" : "opacity-50"}
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                  >
                    <Switch
                      className="bg-mineshaft-400/50 shadow-inner data-[state=checked]:bg-green/80"
                      id="tls-reject-unauthorized"
                      thumbClassName="bg-mineshaft-800"
                      isChecked={tlsEnabled ? value : false}
                      onCheckedChange={onChange}
                      isDisabled={!tlsEnabled}
                    >
                      <p className="w-38">
                        Reject Unauthorized
                        <Tooltip
                          className="max-w-md"
                          content={
                            <p>
                              If enabled, Infisical will only connect to the server if it has a
                              valid, trusted TLS certificate.
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

        <div className="mt-6 flex items-center">
          <Button
            className="mr-4"
            size="sm"
            type="submit"
            colorSchema="secondary"
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
          >
            {isUpdate ? "Update Credentials" : "Connect to Database"}
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
