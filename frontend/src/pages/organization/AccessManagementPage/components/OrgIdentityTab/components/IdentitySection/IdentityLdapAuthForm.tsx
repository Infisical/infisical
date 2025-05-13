import { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faPlus, faQuestionCircle, faXmark } from "@fortawesome/free-solid-svg-icons";
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
  Tabs,
  TextArea,
  Tooltip
} from "@app/components/v2";
import { useOrganization, useSubscription } from "@app/context";
import {
  useAddIdentityLdapAuth,
  useGetIdentityLdapAuth,
  useUpdateIdentityLdapAuth
} from "@app/hooks/api";
import { IdentityTrustedIp } from "@app/hooks/api/identities/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { IdentityFormTab } from "./types";

const schema = z
  .object({
    url: z.string().min(1),
    bindDN: z.string(),
    bindPass: z.string(),
    searchBase: z.string(),
    searchFilter: z.string(), // defaults to (uid={{username}})
    ldapCaCertificate: z
      .string()
      .optional()
      .transform((val) => val || undefined),
    allowedFields: z
      .object({
        key: z.string().trim(),
        value: z
          .string()
          .trim()
          .transform((val) => val.replace(/\s/g, ""))
      })
      .array()
      .optional(),

    accessTokenTTL: z.string().refine((val) => Number(val) <= 315360000, {
      message: "Access Token TTL cannot be greater than 315360000"
    }),
    accessTokenMaxTTL: z.string().refine((val) => Number(val) <= 315360000, {
      message: "Access Token Max TTL cannot be greater than 315360000"
    }),
    accessTokenNumUsesLimit: z.string(),
    accessTokenTrustedIps: z
      .array(
        z.object({
          ipAddress: z.string().max(50)
        })
      )
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

export const IdentityLdapAuthForm = ({
  handlePopUpOpen,
  handlePopUpToggle,
  identityId,
  isUpdate
}: Props) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { subscription } = useSubscription();

  const { mutateAsync: addMutateAsync } = useAddIdentityLdapAuth();
  const { mutateAsync: updateMutateAsync } = useUpdateIdentityLdapAuth();
  const [tabValue, setTabValue] = useState<IdentityFormTab>(IdentityFormTab.Configuration);

  const { data } = useGetIdentityLdapAuth(identityId ?? "", {
    enabled: isUpdate
  });

  const {
    control,
    handleSubmit,
    reset,

    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      url: "",
      bindDN: "",
      bindPass: "",
      searchBase: "",
      searchFilter: "(uid={{username}})",
      accessTokenTTL: "2592000",
      accessTokenMaxTTL: "2592000",
      accessTokenNumUsesLimit: "0",
      accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }]
    }
  });

  const {
    fields: accessTokenTrustedIpsFields,
    append: appendAccessTokenTrustedIp,
    remove: removeAccessTokenTrustedIp
  } = useFieldArray({ control, name: "accessTokenTrustedIps" });

  const {
    fields: allowedFieldsFields,
    append: appendAllowedField,
    remove: removeAllowedField
  } = useFieldArray({ control, name: "allowedFields" });

  useEffect(() => {
    if (data) {
      reset({
        url: data.url,
        bindDN: data.bindDN,
        bindPass: data.bindPass,
        searchBase: data.searchBase,
        searchFilter: data.searchFilter,
        ldapCaCertificate: data.ldapCaCertificate || undefined,
        allowedFields: data.allowedFields,
        accessTokenTTL: String(data.accessTokenTTL),
        accessTokenMaxTTL: String(data.accessTokenMaxTTL),
        accessTokenNumUsesLimit: String(data.accessTokenNumUsesLimit),
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
        url: "",
        bindDN: "",
        bindPass: "",
        searchBase: "",
        searchFilter: "(uid={{username}})",
        ldapCaCertificate: undefined,
        allowedFields: [],
        accessTokenTTL: "2592000",
        accessTokenMaxTTL: "2592000",
        accessTokenNumUsesLimit: "0",
        accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }]
      });
    }
  }, [data]);

  useEffect(() => {
    if (!subscription?.ldap) {
      handlePopUpOpen("upgradePlan");
      handlePopUpToggle("identityAuthMethod", false);
    }
  }, [subscription]);

  const onFormSubmit = async ({
    url,
    bindDN,
    bindPass,
    searchBase,
    searchFilter,
    ldapCaCertificate,
    allowedFields,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps
  }: FormData) => {
    try {
      if (!identityId) return;

      if (data) {
        await updateMutateAsync({
          organizationId: orgId,
          identityId,
          url,
          bindDN,
          bindPass,
          searchBase,
          searchFilter,
          ldapCaCertificate,
          allowedFields,
          accessTokenTTL: Number(accessTokenTTL),
          accessTokenMaxTTL: Number(accessTokenMaxTTL),
          accessTokenNumUsesLimit: Number(accessTokenNumUsesLimit),
          accessTokenTrustedIps
        });
      } else {
        await addMutateAsync({
          organizationId: orgId,
          identityId,
          url,
          bindDN,
          bindPass,
          searchBase,
          searchFilter,
          ldapCaCertificate,
          allowedFields,
          accessTokenTTL: Number(accessTokenTTL),
          accessTokenMaxTTL: Number(accessTokenMaxTTL),
          accessTokenNumUsesLimit: Number(accessTokenNumUsesLimit),
          accessTokenTrustedIps
        });
      }

      handlePopUpToggle("identityAuthMethod", false);

      createNotification({
        text: `Successfully ${isUpdate ? "updated" : "configured"} auth method`,
        type: "success"
      });

      reset();
    } catch {
      createNotification({
        text: `Failed to ${isUpdate ? "update" : "configure"} identity`,
        type: "error"
      });
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit, (fields) => {
        setTabValue(
          [
            "url",
            "bindDN",
            "bindPass",
            "searchBase",
            "searchFilter",
            "accessTokenTTL",
            "allowedFields",
            "accessTokenMaxTTL",
            "accessTokenNumUsesLimit"
          ].includes(Object.keys(fields)[0])
            ? IdentityFormTab.Configuration
            : IdentityFormTab.Advanced
        );
      })}
    >
      <Tabs value={tabValue} onValueChange={(value) => setTabValue(value as IdentityFormTab)}>
        <TabList>
          <Tab value={IdentityFormTab.Configuration}>Configuration</Tab>
          <Tab value={IdentityFormTab.Advanced}>Advanced</Tab>
        </TabList>
        <TabPanel value={IdentityFormTab.Configuration}>
          <Controller
            control={control}
            defaultValue="2592000"
            name="url"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="LDAP URL"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder="ldaps://domain-or-ip:636" type="text" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="bindDN"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                isRequired
                label="Bind DN"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="cn=infisical,ou=Users,dc=example,dc=com" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue=""
            name="bindPass"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                isRequired
                label="Bind Pass"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="********" type="password" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="searchBase"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                isRequired
                label="Search Base / DN"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="ou=machines,dc=acme,dc=com" />
              </FormControl>
            )}
          />

          <Controller
            control={control}
            name="searchFilter"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                isRequired
                label="Search Filter"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="(uid={{username}})" />
              </FormControl>
            )}
          />

          {allowedFieldsFields.map(({ id }, index) => (
            <div className="mb-3 flex items-end space-x-2" key={id}>
              <Controller
                control={control}
                name={`allowedFields.${index}.key`}
                render={({ field, fieldState: { error } }) => {
                  const isFirstField = index === 0;

                  return (
                    <FormControl
                      className="mb-0 flex-grow"
                      label={isFirstField ? "Required Attributes" : undefined}
                      icon={
                        isFirstField ? (
                          <Tooltip
                            className="max-w-[420px]"
                            content={
                              <div className="max-h-[300px] space-y-4 overflow-y-auto text-sm">
                                <p>
                                  Specify the fields that the user must contain in their LDAP entry
                                  in order to authenticate with this identity. If nothing is
                                  specified, all users in the configured LDAP directory will be able
                                  to authenticate.
                                  <p className="mt-2">
                                    You can specify multiple required attributes by separating them
                                    with a comma.
                                  </p>
                                </p>
                                <div className="space-y-2">
                                  <p>Example:</p>
                                  <p className="text-xs text-gray-400">
                                    &apos;uid&apos; → &apos;user1,user2,user3&apos;
                                    <br />
                                    &apos;mail&apos; → &apos;user@example.com&apos;
                                  </p>
                                </div>

                                <p>
                                  The above example would allow users with the UID user1, user2, or
                                  user3 to authenticate but only if their emails also match
                                  user@example.com
                                </p>
                              </div>
                            }
                          >
                            <FontAwesomeIcon icon={faQuestionCircle} size="sm" />
                          </Tooltip>
                        ) : undefined
                      }
                      isError={Boolean(error)}
                      errorText={error?.message}
                    >
                      <Input
                        value={field.value}
                        onChange={(e) => field.onChange(e)}
                        placeholder="uid"
                      />
                    </FormControl>
                  );
                }}
              />
              <Controller
                control={control}
                name={`allowedFields.${index}.value`}
                render={({ field, fieldState: { error } }) => {
                  return (
                    <FormControl
                      className="mb-0 flex-grow"
                      isError={Boolean(error)}
                      errorText={error?.message}
                    >
                      <Input
                        value={field.value}
                        onChange={(e) => field.onChange(e)}
                        placeholder="userid1,userid2,userid3"
                      />
                    </FormControl>
                  );
                }}
              />
              <IconButton
                onClick={() => removeAllowedField(index)}
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
              onClick={() =>
                appendAllowedField({
                  key: "",
                  value: ""
                })
              }
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              size="xs"
            >
              Add Required Attribute
            </Button>
          </div>

          <Controller
            control={control}
            defaultValue="2592000"
            name="accessTokenTTL"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Access Token TTL (seconds)"
                tooltipText="The lifetime for an acccess token in seconds. This value will be referenced at renewal time."
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
                tooltipText="The maximum lifetime for an access token in seconds. This value will be referenced at renewal time."
              >
                <Input {...field} placeholder="2592000" type="number" min="0" step="1" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue="0"
            name="accessTokenNumUsesLimit"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Access Token Max Number of Uses"
                isError={Boolean(error)}
                errorText={error?.message}
                tooltipText="The maximum number of times that an access token can be used; a value of 0 implies infinite number of uses."
              >
                <Input {...field} placeholder="0" type="number" min="0" step="1" />
              </FormControl>
            )}
          />
        </TabPanel>
        <TabPanel value={IdentityFormTab.Advanced}>
          <Controller
            control={control}
            name="ldapCaCertificate"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="CA Certificate"
                isOptional
                errorText={error?.message}
                isError={Boolean(error)}
                tooltipText="An optional PEM-encoded CA cert for the LDAP server. This is used by the TLS client for secure communication with the LDAP server."
              >
                <TextArea {...field} placeholder="-----BEGIN CERTIFICATE----- ..." />
              </FormControl>
            )}
          />

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
                      tooltipText="The IPs or CIDR ranges that access tokens can be used from. By default, each token is given the 0.0.0.0/0, allowing usage from any network address."
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
