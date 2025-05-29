import { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  IconButton,
  Input,
  Tab,
  TabList,
  TabPanel,
  Tabs
} from "@app/components/v2";
import { useOrganization, useSubscription } from "@app/context";
import {
  useAddIdentityUniversalAuth,
  useGetIdentityUniversalAuth,
  useUpdateIdentityUniversalAuth
} from "@app/hooks/api";
import { IdentityTrustedIp } from "@app/hooks/api/identities/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { IdentityFormTab } from "./types";

const schema = z
  .object({
    accessTokenTTL: z
      .string()
      .refine(
        (value) => Number(value) <= 315360000,
        "Access Token TTL cannot be greater than 315360000"
      ),
    accessTokenMaxTTL: z
      .string()
      .refine(
        (value) => Number(value) <= 315360000,
        "Access Max Token TTL cannot be greater than 315360000"
      ),
    accessTokenPeriod: z
      .string()
      .optional()
      .refine(
        (value) => !value || Number(value) <= 315360000,
        "Access Token Period cannot be greater than 315360000"
      ),
    accessTokenNumUsesLimit: z.string(),
    clientSecretTrustedIps: z
      .object({
        ipAddress: z.string().max(50)
      })
      .array()
      .min(1),
    accessTokenTrustedIps: z
      .object({
        ipAddress: z.string().max(50)
      })
      .array()
      .min(1)
  })
  .required();

export type FormData = z.infer<typeof schema>;

type Props = {
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["upgradePlan"]>) => void;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["identityAuthMethod"]>,
    state?: boolean
  ) => void;
  identityId?: string;
  isUpdate?: boolean;
};

export const IdentityUniversalAuthForm = ({
  handlePopUpOpen,
  handlePopUpToggle,
  identityId,
  isUpdate
}: Props) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { subscription } = useSubscription();
  const { mutateAsync: addMutateAsync } = useAddIdentityUniversalAuth();
  const { mutateAsync: updateMutateAsync } = useUpdateIdentityUniversalAuth();
  const [tabValue, setTabValue] = useState<IdentityFormTab>(IdentityFormTab.Configuration);

  const { data } = useGetIdentityUniversalAuth(identityId ?? "", {
    enabled: isUpdate
  });

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
    watch
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      accessTokenTTL: "2592000",
      accessTokenMaxTTL: "2592000",
      accessTokenNumUsesLimit: "0",
      clientSecretTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }],
      accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }],
      accessTokenPeriod: "0"
    }
  });

  const accessTokenPeriodValue = Number(watch("accessTokenPeriod"));

  const {
    fields: clientSecretTrustedIpsFields,
    append: appendClientSecretTrustedIp,
    remove: removeClientSecretTrustedIp
  } = useFieldArray({ control, name: "clientSecretTrustedIps" });
  const {
    fields: accessTokenTrustedIpsFields,
    append: appendAccessTokenTrustedIp,
    remove: removeAccessTokenTrustedIp
  } = useFieldArray({ control, name: "accessTokenTrustedIps" });

  useEffect(() => {
    if (data) {
      reset({
        accessTokenTTL: String(data.accessTokenTTL),
        accessTokenMaxTTL: String(data.accessTokenMaxTTL),
        accessTokenNumUsesLimit: String(data.accessTokenNumUsesLimit),
        accessTokenPeriod: String(data.accessTokenPeriod),
        clientSecretTrustedIps: data.clientSecretTrustedIps.map(
          ({ ipAddress, prefix }: IdentityTrustedIp) => {
            return {
              ipAddress: `${ipAddress}${prefix !== undefined ? `/${prefix}` : ""}`
            };
          }
        ),
        accessTokenTrustedIps: data.accessTokenTrustedIps.map(
          ({ ipAddress, prefix }: IdentityTrustedIp) => {
            return {
              ipAddress: `${ipAddress}${prefix !== undefined ? `/${prefix}` : ""}`
            };
          }
        )
      });
    } else {
      reset({
        accessTokenTTL: "2592000",
        accessTokenMaxTTL: "2592000",
        accessTokenNumUsesLimit: "0",
        accessTokenPeriod: "0",
        clientSecretTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }],
        accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }]
      });
    }
  }, [data]);

  const onFormSubmit = async ({
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    clientSecretTrustedIps,
    accessTokenTrustedIps,
    accessTokenPeriod
  }: FormData) => {
    try {
      if (!identityId) return;

      if (data) {
        // update universal auth configuration
        await updateMutateAsync({
          organizationId: orgId,
          identityId,
          clientSecretTrustedIps,
          accessTokenTTL: Number(accessTokenTTL),
          accessTokenMaxTTL: Number(accessTokenMaxTTL),
          accessTokenNumUsesLimit: Number(accessTokenNumUsesLimit),
          accessTokenTrustedIps,
          accessTokenPeriod: Number(accessTokenPeriod)
        });
      } else {
        // create new universal auth configuration

        await addMutateAsync({
          organizationId: orgId,
          identityId,
          clientSecretTrustedIps,
          accessTokenTTL: Number(accessTokenTTL),
          accessTokenMaxTTL: Number(accessTokenMaxTTL),
          accessTokenNumUsesLimit: Number(accessTokenNumUsesLimit),
          accessTokenTrustedIps,
          accessTokenPeriod: Number(accessTokenPeriod)
        });
      }

      handlePopUpToggle("identityAuthMethod", false);

      createNotification({
        text: `Successfully ${isUpdate ? "updated" : "created"} auth method`,
        type: "success"
      });

      reset();
    } catch {
      const text = `Failed to ${isUpdate ? "update" : "configure"} identity`;

      createNotification({
        text,
        type: "error"
      });
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit, (fields) => {
        setTabValue(
          ["accessTokenTrustedIps", "clientSecretTrustedIps"].includes(Object.keys(fields)[0])
            ? IdentityFormTab.Advanced
            : IdentityFormTab.Configuration
        );
      })}
    >
      <Tabs value={tabValue} onValueChange={(value) => setTabValue(value as IdentityFormTab)}>
        <TabList>
          <Tab value={IdentityFormTab.Configuration}>Configuration</Tab>
          <Tab value={IdentityFormTab.Advanced}>Advanced</Tab>
        </TabList>
        <TabPanel value={IdentityFormTab.Configuration}>
          {accessTokenPeriodValue > 0 ? (
            <div className="mb-4 text-xs text-bunker-400">
              When Access Token Period is set, TTL and Max TTL are ignored.
            </div>
          ) : (
            <>
              <Controller
                control={control}
                defaultValue="2592000"
                name="accessTokenTTL"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Access Token TTL (seconds)"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <Input {...field} placeholder="2592000" type="number" min="0" step="1" />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                defaultValue="2592000"
                name="accessTokenMaxTTL"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Access Token Max TTL (seconds)"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <Input {...field} placeholder="2592000" type="number" min="0" step="1" />
                  </FormControl>
                )}
              />
            </>
          )}
          <Controller
            control={control}
            defaultValue="0"
            name="accessTokenNumUsesLimit"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Access Token Max Number of Uses"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="0" type="number" min="0" step="1" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue="0"
            name="accessTokenPeriod"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Access Token Period (seconds)"
                isError={Boolean(error)}
                errorText={error?.message}
                helperText="For periodic tokens: set a period (in seconds) to allow indefinite renewal. Set to 0 to disable periodic tokens and use TTL-based expiration."
              >
                <Input {...field} placeholder="0" type="number" min="0" step="1" />
              </FormControl>
            )}
          />
        </TabPanel>
        <TabPanel value={IdentityFormTab.Advanced}>
          {clientSecretTrustedIpsFields.map(({ id }, index) => (
            <div className="mb-3 flex items-end space-x-2" key={id}>
              <Controller
                control={control}
                name={`clientSecretTrustedIps.${index}.ipAddress`}
                defaultValue="0.0.0.0/0"
                render={({ field, fieldState: { error } }) => {
                  return (
                    <FormControl
                      className="mb-0 flex-grow"
                      label={index === 0 ? "Client Secret Trusted IPs" : undefined}
                      isError={Boolean(error)}
                      errorText={error?.message}
                    >
                      <Input
                        value={field.value}
                        onChange={(e) => {
                          if (subscription?.ipAllowlisting) {
                            field.onChange(e);
                            return;
                          }

                          handlePopUpOpen("upgradePlan");
                        }}
                        placeholder="123.456.789.0"
                      />
                    </FormControl>
                  );
                }}
              />
              <IconButton
                onClick={() => {
                  if (subscription?.ipAllowlisting) {
                    removeClientSecretTrustedIp(index);
                    return;
                  }

                  handlePopUpOpen("upgradePlan");
                }}
                size="lg"
                colorSchema="danger"
                variant="plain"
                ariaLabel="update"
                className="p-3"
              >
                <FontAwesomeIcon icon={faXmark} />
              </IconButton>
            </div>
          ))}
          <div className="my-4 ml-1">
            <Button
              variant="outline_bg"
              onClick={() => {
                if (subscription?.ipAllowlisting) {
                  appendClientSecretTrustedIp({
                    ipAddress: "0.0.0.0/0"
                  });
                  return;
                }

                handlePopUpOpen("upgradePlan");
              }}
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              size="xs"
            >
              Add IP Address
            </Button>
          </div>
          {accessTokenTrustedIpsFields.map(({ id }, index) => (
            <div className="mb-3 flex items-end space-x-2" key={id}>
              <Controller
                control={control}
                name={`accessTokenTrustedIps.${index}.ipAddress`}
                defaultValue="0.0.0.0/0"
                render={({ field, fieldState: { error } }) => {
                  return (
                    <FormControl
                      className="mb-0 flex-grow"
                      label={index === 0 ? "Access Token Trusted IPs" : undefined}
                      isError={Boolean(error)}
                      errorText={error?.message}
                    >
                      <Input
                        value={field.value}
                        onChange={(e) => {
                          if (subscription?.ipAllowlisting) {
                            field.onChange(e);
                            return;
                          }

                          handlePopUpOpen("upgradePlan");
                        }}
                        placeholder="123.456.789.0"
                      />
                    </FormControl>
                  );
                }}
              />
              <IconButton
                onClick={() => {
                  if (subscription?.ipAllowlisting) {
                    removeAccessTokenTrustedIp(index);
                    return;
                  }

                  handlePopUpOpen("upgradePlan");
                }}
                size="lg"
                colorSchema="danger"
                variant="plain"
                ariaLabel="update"
                className="p-3"
              >
                <FontAwesomeIcon icon={faXmark} />
              </IconButton>
            </div>
          ))}
          <div className="my-4 ml-1">
            <Button
              variant="outline_bg"
              onClick={() => {
                if (subscription?.ipAllowlisting) {
                  appendAccessTokenTrustedIp({
                    ipAddress: "0.0.0.0/0"
                  });
                  return;
                }

                handlePopUpOpen("upgradePlan");
              }}
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              size="xs"
            >
              Add IP Address
            </Button>
          </div>
        </TabPanel>
      </Tabs>
      <div className="flex items-center">
        <Button
          className="mr-4"
          size="sm"
          type="submit"
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
        >
          {isUpdate ? "Update" : "Add"}
        </Button>
        <Button
          colorSchema="secondary"
          variant="plain"
          onClick={() => handlePopUpToggle("identityAuthMethod", false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
};
