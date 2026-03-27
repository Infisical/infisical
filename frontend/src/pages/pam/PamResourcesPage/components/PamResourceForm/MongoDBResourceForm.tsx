import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tab } from "@headlessui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { FormControl, Input, Switch, TextArea, Tooltip } from "@app/components/v2";
import { Button, SheetFooter } from "@app/components/v3";
import { PamResourceType, TMongoDBResource } from "@app/hooks/api/pam";

import { GenericResourceFields, genericResourceFieldsSchema } from "./GenericResourceFields";
import { MetadataFields } from "./MetadataFields";

type Props = {
  resource?: TMongoDBResource;
  onSubmit: (formData: FormData) => Promise<void>;
  closeSheet: () => void;
};

const formSchema = genericResourceFieldsSchema.extend({
  resourceType: z.literal(PamResourceType.MongoDB),
  connectionDetails: z.object({
    host: z.string().trim().min(1, "Host required"),
    port: z
      .union([z.literal(""), z.coerce.number()])
      .optional()
      .transform((v) => (v === "" || v === 0 ? undefined : v)),
    database: z.string().trim().min(1, "Database required").default("admin"),
    sslEnabled: z.boolean().default(true),
    sslRejectUnauthorized: z.boolean().default(true),
    sslCertificate: z
      .string()
      .trim()
      .transform((value) => value || undefined)
      .optional()
  })
});

type FormData = z.infer<typeof formSchema>;

export const MongoDBResourceForm = ({ resource, onSubmit, closeSheet }: Props) => {
  const isUpdate = Boolean(resource);
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: resource
      ? {
          ...resource,
          connectionDetails: {
            ...resource.connectionDetails,
            // Display empty field for SRV hosts (port 0 or undefined)
            port: resource.connectionDetails.port || undefined
          }
        }
      : {
          resourceType: PamResourceType.MongoDB,
          connectionDetails: {
            host: "",
            port: undefined,
            database: "admin",
            sslEnabled: true,
            sslRejectUnauthorized: true,
            sslCertificate: undefined
          }
        }
  });

  const {
    handleSubmit,
    control,
    watch,
    formState: { isSubmitting, isDirty }
  } = form;

  const sslEnabled = watch("connectionDetails.sslEnabled");

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(e) => {
          setSelectedTabIndex(0);
          handleSubmit(onSubmit)(e);
        }}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="flex min-h-0 flex-1 shrink flex-col gap-4 overflow-y-auto p-4 pb-8">
          <GenericResourceFields />
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
                SSL ({sslEnabled ? "Enabled" : "Disabled"})
              </Tab>
            </Tab.List>
            <Tab.Panels className="mb-4 rounded-sm border border-mineshaft-600 bg-mineshaft-700/70 p-3 pb-0">
              <Tab.Panel>
                <div className="mt-[0.675rem] flex items-start gap-2">
                  <Controller
                    name="connectionDetails.host"
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
                    name="connectionDetails.port"
                    control={control}
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        className="w-36"
                        errorText={error?.message}
                        isError={Boolean(error?.message)}
                        label="Port"
                        helperText="Leave empty for SRV"
                        isOptional
                      >
                        <Input type="number" {...field} value={field.value ?? ""} />
                      </FormControl>
                    )}
                  />
                </div>
                <Controller
                  name="connectionDetails.database"
                  control={control}
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      errorText={error?.message}
                      isError={Boolean(error?.message)}
                      label="Database"
                    >
                      <Input {...field} />
                    </FormControl>
                  )}
                />
              </Tab.Panel>
              <Tab.Panel>
                <Controller
                  name="connectionDetails.sslEnabled"
                  control={control}
                  render={({ field: { value, onChange }, fieldState: { error } }) => (
                    <FormControl isError={Boolean(error?.message)} errorText={error?.message}>
                      <Switch
                        className="bg-mineshaft-400/50 shadow-inner data-[state=checked]:bg-green/80"
                        id="ssl-enabled"
                        thumbClassName="bg-mineshaft-800"
                        isChecked={value}
                        onCheckedChange={onChange}
                      >
                        Enable SSL
                      </Switch>
                    </FormControl>
                  )}
                />
                <Controller
                  name="connectionDetails.sslCertificate"
                  control={control}
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      errorText={error?.message}
                      isError={Boolean(error?.message)}
                      className={sslEnabled ? "" : "opacity-50"}
                      label="Trusted CA SSL Certificate"
                      isOptional
                    >
                      <TextArea className="h-14 resize-none!" {...field} isDisabled={!sslEnabled} />
                    </FormControl>
                  )}
                />
                <Controller
                  name="connectionDetails.sslRejectUnauthorized"
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
                        <p className="w-38">
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
          <MetadataFields />
        </div>
        <SheetFooter className="shrink-0 border-t">
          <Button
            isPending={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
            variant="neutral"
            type="submit"
          >
            {isUpdate ? "Update Details" : "Create Resource"}
          </Button>
          <Button onClick={() => closeSheet()} variant="outline" className="mr-auto" type="button">
            Cancel
          </Button>
        </SheetFooter>
      </form>
    </FormProvider>
  );
};
