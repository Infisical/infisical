import { Dispatch, SetStateAction } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tab } from "@headlessui/react";

import { FormControl, Input, Switch, TextArea, Tooltip } from "@app/components/v2";

type Props = {
  selectedTabIndex: number;
  setSelectedTabIndex: Dispatch<SetStateAction<number>>;
};

export const RedisResourceFields = ({ setSelectedTabIndex, selectedTabIndex }: Props) => {
  const { control, watch } = useFormContext();

  const sslEnabled = watch("connectionDetails.sslEnabled");
  return (
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
          <div className="mt-4 flex items-start gap-2">
            <Controller
              name="connectionDetails.username"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  className="flex-1"
                  errorText={error?.message}
                  isError={Boolean(error?.message)}
                  label="Username"
                  isOptional
                >
                  <Input {...field} />
                </FormControl>
              )}
            />
            <Controller
              name="connectionDetails.password"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  className="flex-1"
                  errorText={error?.message}
                  isError={Boolean(error?.message)}
                  label="Password"
                  isOptional
                >
                  <Input type="password" {...field} />
                </FormControl>
              )}
            />
          </div>
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
  );
};
