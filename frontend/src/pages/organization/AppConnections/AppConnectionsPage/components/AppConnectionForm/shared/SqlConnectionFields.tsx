import { Dispatch, SetStateAction } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tab } from "@headlessui/react";

import { FormControl, Input, SecretInput, Switch, TextArea, Tooltip } from "@app/components/v2";

type Props = {
  isPlatformManagedCredentials: boolean;
  selectedTabIndex: number;
  setSelectedTabIndex: Dispatch<SetStateAction<number>>;
};

export const SqlConnectionFields = ({
  isPlatformManagedCredentials,
  setSelectedTabIndex,
  selectedTabIndex
}: Props) => {
  const { control, watch } = useFormContext();

  const sslEnabled = watch("credentials.sslEnabled");
  return (
    <>
      <Tab.Group selectedIndex={selectedTabIndex} onChange={setSelectedTabIndex}>
        <Tab.List className="-pb-1 mb-6 w-full border-b-2 border-mineshaft-600">
          <Tab
            className={({ selected }) =>
              `-mb-[0.14rem] px-4 py-2 text-sm font-medium whitespace-nowrap outline-hidden disabled:opacity-60 ${
                selected ? "border-b-2 border-mineshaft-300 text-mineshaft-200" : "text-bunker-300"
              }`
            }
          >
            Configuration
          </Tab>
          <Tab
            className={({ selected }) =>
              `-mb-[0.14rem] px-4 py-2 text-sm font-medium whitespace-nowrap outline-hidden disabled:opacity-60 ${
                selected ? "border-b-2 border-mineshaft-300 text-mineshaft-200" : "text-bunker-300"
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
                name="credentials.host"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    className="flex-1"
                    errorText={error?.message}
                    isError={Boolean(error?.message)}
                    label="Host"
                  >
                    <Input {...field} isDisabled={isPlatformManagedCredentials} />
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
                    label="Database Name"
                  >
                    <Input {...field} isDisabled={isPlatformManagedCredentials} />
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
                    <Input type="number" {...field} isDisabled={isPlatformManagedCredentials} />
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
                    <Input {...field} isDisabled={isPlatformManagedCredentials} />
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
                      isDisabled={isPlatformManagedCredentials}
                    />
                  </FormControl>
                )}
              />
            </div>
          </Tab.Panel>
          <Tab.Panel>
            <Controller
              name="credentials.sslEnabled"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl isError={Boolean(error?.message)} errorText={error?.message}>
                  <Switch
                    className="bg-mineshaft-400/50 shadow-inner data-[state=checked]:bg-green/80"
                    id="ssl-enabled"
                    thumbClassName="bg-mineshaft-800"
                    isChecked={value}
                    onCheckedChange={onChange}
                    isDisabled={isPlatformManagedCredentials}
                  >
                    Enable SSL
                  </Switch>
                </FormControl>
              )}
            />
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
                    className="h-14 resize-none!"
                    {...field}
                    isDisabled={isPlatformManagedCredentials || !sslEnabled}
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
                    isDisabled={isPlatformManagedCredentials || !sslEnabled}
                  >
                    <p className="w-38">
                      Reject Unauthorized
                      <Tooltip
                        className="max-w-md"
                        content={
                          <p>
                            If enabled, Infisical will only connect to the server if it has a valid,
                            trusted SSL certificate.
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
      {!isPlatformManagedCredentials && (
        <Controller
          name="isPlatformManagedCredentials"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl isError={Boolean(error?.message)} errorText={error?.message}>
              <Switch
                className="bg-mineshaft-400/50 shadow-inner data-[state=checked]:bg-green/80"
                id="platform-managed"
                thumbClassName="bg-mineshaft-800"
                isChecked={value}
                onCheckedChange={onChange}
                isDisabled={isPlatformManagedCredentials}
              >
                <p className="w-[13.6rem]">
                  Platform Managed Credentials
                  <Tooltip
                    className="max-w-md"
                    content={
                      <p>
                        If enabled, Infisical will manage the credentials of this App Connection by
                        updating the password on creation.
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
      )}
    </>
  );
};
