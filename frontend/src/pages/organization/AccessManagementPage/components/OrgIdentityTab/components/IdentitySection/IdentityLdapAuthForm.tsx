import { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faPlus, faQuestionCircle, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams } from "@tanstack/react-router";
import ms from "ms";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  IconButton,
  Input,
  Select,
  SelectItem,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TextArea,
  Tooltip
} from "@app/components/v2";
import { useOrganization, useOrgPermission, useSubscription } from "@app/context";
import {
  OrgPermissionMachineIdentityAuthTemplateActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { getObjectFromSeconds } from "@app/helpers/datetime";
import {
  MachineIdentityAuthMethod,
  useAddIdentityLdapAuth,
  useGetIdentityLdapAuth,
  useUpdateIdentityLdapAuth
} from "@app/hooks/api";
import { IdentityTrustedIp } from "@app/hooks/api/identities/types";
import { useGetAvailableTemplates } from "@app/hooks/api/identityAuthTemplates/queries";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { LockoutTab } from "./lockout/LockoutTab";
import { superRefineLockout } from "./lockout/super-refine";
import { IdentityFormTab } from "./types";

const schema = z
  .object({
    scope: z.enum(["template", "custom"]),
    templateId: z.string().optional(),
    url: z.string().optional(),
    bindDN: z.string().optional(),
    bindPass: z.string().optional(),
    searchBase: z.string().optional(),
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
      .min(1),

    lockoutEnabled: z.boolean().default(true),
    lockoutThreshold: z
      .string()
      .refine(
        (value) => Number(value) <= 30 && Number(value) >= 1,
        "Lockout threshold must be between 1 and 30"
      ),
    lockoutDurationValue: z.string(),
    lockoutDurationUnit: z.enum(["s", "m", "h", "d"], {
      invalid_type_error: "Please select a valid time unit"
    }),
    lockoutCounterResetValue: z.string(),
    lockoutCounterResetUnit: z.enum(["s", "m", "h"], {
      invalid_type_error: "Please select a valid time unit"
    })
  })
  .required()
  .superRefine((data, ctx) => {
    superRefineLockout(data, ctx);

    // Validation based on scope
    if (data.scope === "template") {
      if (!data.templateId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Template is required when using template scope",
          path: ["templateId"]
        });
      }
      return;
    }

    if (data.scope === "custom") {
      if (!data.url) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "LDAP URL is required when using custom scope",
          path: ["url"]
        });
      }
      if (!data.bindDN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Bind DN is required when using custom scope",
          path: ["bindDN"]
        });
      }
      if (!data.bindPass) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Bind Pass is required when using custom scope",
          path: ["bindPass"]
        });
      }
      if (!data.searchBase) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Search Base is required when using custom scope",
          path: ["searchBase"]
        });
      }
    }
  });

export type FormData = z.infer<typeof schema>;

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["upgradePlan"]>,
    data?: { isEnterpriseFeature?: boolean; featureName?: string }
  ) => void;
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
  const { projectId } = useParams({
    strict: false
  });
  const { mutateAsync: addMutateAsync } = useAddIdentityLdapAuth();
  const { mutateAsync: updateMutateAsync } = useUpdateIdentityLdapAuth();
  const [tabValue, setTabValue] = useState<IdentityFormTab>(IdentityFormTab.Configuration);
  const { data: templates } = useGetAvailableTemplates(MachineIdentityAuthMethod.LDAP);
  const { permission } = useOrgPermission();

  const canAttachTemplates = permission.can(
    OrgPermissionMachineIdentityAuthTemplateActions.AttachTemplates,
    OrgPermissionSubjects.MachineIdentityAuthTemplate
  );

  const { data } = useGetIdentityLdapAuth(identityId ?? "", {
    enabled: isUpdate
  });

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      scope: "custom",
      templateId: "",
      url: "",
      bindDN: "",
      bindPass: "",
      searchBase: "",
      searchFilter: "(uid={{username}})",
      accessTokenTTL: "2592000",
      accessTokenMaxTTL: "2592000",
      accessTokenNumUsesLimit: "0",
      accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }],
      lockoutEnabled: true,
      lockoutThreshold: "3",
      lockoutDurationValue: "5",
      lockoutDurationUnit: "m",
      lockoutCounterResetValue: "30",
      lockoutCounterResetUnit: "s"
    }
  });

  const scope = watch("scope");

  const lockoutEnabledWatch = watch("lockoutEnabled");
  const lockoutThresholdWatch = watch("lockoutThreshold");
  const lockoutDurationValueWatch = watch("lockoutDurationValue");
  const lockoutDurationUnitWatch = watch("lockoutDurationUnit");
  const lockoutCounterResetValueWatch = watch("lockoutCounterResetValue");
  const lockoutCounterResetUnitWatch = watch("lockoutCounterResetUnit");

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

  // Helper function to determine scope based on existing data
  const determineScope = (authData: any) => {
    // If templateId exists in the data, it's template scope
    if (authData.templateId) {
      return "template";
    }
    // Default to custom if we can't determine
    return "custom";
  };

  useEffect(() => {
    if (data) {
      const detectedScope = determineScope(data);

      const lockoutDurationObj = getObjectFromSeconds(data.lockoutDurationSeconds);
      const lockoutCounterResetObj = getObjectFromSeconds(data.lockoutCounterResetSeconds);

      reset({
        scope: detectedScope,
        templateId: data.templateId || "",
        url: data.url || "",
        bindDN: data.bindDN || "",
        bindPass: data.bindPass || "",
        searchBase: data.searchBase || "",
        searchFilter: data.searchFilter,
        ldapCaCertificate: data.ldapCaCertificate || undefined,
        allowedFields: data.allowedFields || [],
        accessTokenTTL: String(data.accessTokenTTL),
        accessTokenMaxTTL: String(data.accessTokenMaxTTL),
        accessTokenNumUsesLimit: String(data.accessTokenNumUsesLimit),
        accessTokenTrustedIps: data.accessTokenTrustedIps.map(
          ({ ipAddress, prefix }: IdentityTrustedIp) => {
            return {
              ipAddress: `${ipAddress}${prefix !== undefined ? `/${prefix}` : ""}`
            };
          }
        ),
        lockoutEnabled: data.lockoutEnabled,
        lockoutThreshold: String(data.lockoutThreshold),
        lockoutDurationValue: String(lockoutDurationObj.value),
        lockoutDurationUnit: lockoutDurationObj.unit as "s" | "m" | "h" | "d",
        lockoutCounterResetValue: String(lockoutCounterResetObj.value),
        lockoutCounterResetUnit: lockoutCounterResetObj.unit as "s" | "m" | "h"
      });
      return;
    }

    reset({
      scope: "custom",
      templateId: "",
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
      accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }],
      lockoutEnabled: true,
      lockoutThreshold: "3",
      lockoutDurationValue: "5",
      lockoutDurationUnit: "m",
      lockoutCounterResetValue: "30",
      lockoutCounterResetUnit: "s"
    });
  }, [data, reset]);

  useEffect(() => {
    if (!subscription?.get(SubscriptionProductCategory.Platform, "ldap")) {
      handlePopUpOpen("upgradePlan", {
        isEnterpriseFeature: true,
        featureName: "LDAP authentication"
      });
      handlePopUpToggle("identityAuthMethod", false);
    }
  }, [subscription, handlePopUpOpen, handlePopUpToggle]);

  const onFormSubmit = async (formData: FormData) => {
    if (!identityId) return;

    const {
      scope: submissionScope,
      templateId: submissionTemplateId,
      url: submissionUrl,
      bindDN: submissionBindDN,
      bindPass: submissionBindPass,
      searchBase: submissionSearchBase,
      searchFilter,
      ldapCaCertificate,
      allowedFields,
      accessTokenTTL,
      accessTokenMaxTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps,
      lockoutEnabled,
      lockoutThreshold,
      lockoutDurationValue,
      lockoutDurationUnit,
      lockoutCounterResetValue,
      lockoutCounterResetUnit
    } = formData;

    const lockoutDurationSeconds = ms(`${lockoutDurationValue}${lockoutDurationUnit}`) / 1000;
    const lockoutCounterResetSeconds =
      ms(`${lockoutCounterResetValue}${lockoutCounterResetUnit}`) / 1000;

    const basePayload = {
      ...(projectId ? { projectId } : { organizationId: orgId }),
      identityId,
      searchFilter,
      ldapCaCertificate,
      allowedFields,
      accessTokenTTL: Number(accessTokenTTL),
      accessTokenMaxTTL: Number(accessTokenMaxTTL),
      accessTokenNumUsesLimit: Number(accessTokenNumUsesLimit),
      accessTokenTrustedIps,
      lockoutEnabled,
      lockoutThreshold: Number(lockoutThreshold),
      lockoutDurationSeconds,
      lockoutCounterResetSeconds
    };

    // Add scope-specific fields
    const payload =
      submissionScope === "template"
        ? { ...basePayload, templateId: submissionTemplateId }
        : {
            ...basePayload,
            url: submissionUrl,
            bindDN: submissionBindDN,
            bindPass: submissionBindPass,
            searchBase: submissionSearchBase
          };

    if (data) {
      await updateMutateAsync(payload);
    } else {
      await addMutateAsync(payload);
    }

    handlePopUpToggle("identityAuthMethod", false);

    createNotification({
      text: `Successfully ${isUpdate ? "updated" : "configured"} auth method`,
      type: "success"
    });

    reset();
  };

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit, (fields) => {
        const firstErrorField = Object.keys(fields)[0];
        let tab = IdentityFormTab.Advanced;

        if (
          [
            "scope",
            "templateId",
            "url",
            "bindDN",
            "bindPass",
            "searchBase",
            "searchFilter",
            "accessTokenTTL",
            "allowedFields",
            "accessTokenMaxTTL",
            "accessTokenNumUsesLimit"
          ].includes(firstErrorField)
        ) {
          tab = IdentityFormTab.Configuration;
        } else if (
          [
            "lockoutEnabled",
            "lockoutThreshold",
            "lockoutDurationValue",
            "lockoutDurationUnit",
            "lockoutCounterResetValue",
            "lockoutCounterResetUnit"
          ].includes(firstErrorField)
        ) {
          tab = IdentityFormTab.Lockout;
        }

        setTabValue(tab);
      })}
    >
      <Tabs value={tabValue} onValueChange={(value) => setTabValue(value as IdentityFormTab)}>
        <TabList>
          <Tab value={IdentityFormTab.Configuration}>Configuration</Tab>
          <Tab value={IdentityFormTab.Lockout}>Lockout</Tab>
          <Tab value={IdentityFormTab.Advanced}>Advanced</Tab>
        </TabList>
        <TabPanel value={IdentityFormTab.Configuration}>
          {canAttachTemplates && (
            <Controller
              control={control}
              name="scope"
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  label="Configuration Type"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <Select
                    value={value}
                    onValueChange={(val) => {
                      onChange(val);
                      setValue("templateId", data?.templateId || "");
                      setValue("url", data?.url || "");
                      setValue("bindDN", data?.bindDN || "");
                      setValue("bindPass", data?.bindPass || "");
                      setValue("searchBase", data?.searchBase || "");
                      setValue("ldapCaCertificate", data?.ldapCaCertificate || "");
                    }}
                    className="w-full"
                    position="popper"
                    dropdownContainerClassName="max-w-none"
                  >
                    <SelectItem value="template">Use Template</SelectItem>
                    <SelectItem value="custom">Custom Configuration</SelectItem>
                  </Select>
                </FormControl>
              )}
            />
          )}

          {scope === "template" && (
            <Controller
              control={control}
              name="templateId"
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  label="Template"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  isRequired
                >
                  <Select
                    value={value}
                    onValueChange={(val) => {
                      onChange(val);
                      const tmp = templates?.find((t) => t.id === val);
                      if (!tmp) return;
                      setValue("url", tmp.templateFields.url);
                      setValue("bindDN", tmp.templateFields.bindDN);
                      setValue("bindPass", tmp.templateFields.bindPass);
                      setValue("searchBase", tmp.templateFields.searchBase);
                      setValue("ldapCaCertificate", tmp.templateFields.ldapCaCertificate);
                    }}
                    className="w-full"
                    position="popper"
                    dropdownContainerClassName="max-w-none"
                    placeholder="Select a template"
                  >
                    {templates?.map((template) => {
                      return (
                        <SelectItem value={template.id} key={template.id}>
                          {template.name}
                        </SelectItem>
                      );
                    })}
                  </Select>
                </FormControl>
              )}
            />
          )}

          <Controller
            control={control}
            name="url"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="LDAP URL"
                isError={Boolean(error)}
                errorText={error?.message}
                tooltipText={
                  scope === "template"
                    ? "This field cannot be modified when using a template"
                    : undefined
                }
                isRequired
              >
                <Input
                  {...field}
                  placeholder="ldaps://domain-or-ip:636"
                  type="text"
                  isDisabled={scope === "template"}
                  containerClassName={scope === "template" ? "opacity-55" : ""}
                />
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
                tooltipText={
                  scope === "template"
                    ? "This field cannot be modified when using a template"
                    : undefined
                }
              >
                <Input
                  {...field}
                  containerClassName={scope === "template" ? "opacity-55" : ""}
                  placeholder="cn=infisical,ou=Users,dc=example,dc=com"
                  isDisabled={scope === "template"}
                />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="bindPass"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                isRequired
                label="Bind Pass"
                isError={Boolean(error)}
                errorText={error?.message}
                tooltipText={
                  scope === "template"
                    ? "This field cannot be modified when using a template"
                    : undefined
                }
              >
                <Input
                  {...field}
                  placeholder="********"
                  type="password"
                  containerClassName={scope === "template" ? "opacity-55" : ""}
                  isDisabled={scope === "template"}
                />
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
                tooltipText={
                  scope === "template"
                    ? "This field cannot be modified when using a template"
                    : undefined
                }
              >
                <Input
                  {...field}
                  placeholder="ou=machines,dc=acme,dc=com"
                  containerClassName={scope === "template" ? "opacity-55" : ""}
                  isDisabled={scope === "template"}
                />
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
                      className="mb-0 grow"
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
                      className="mb-0 grow"
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
        <LockoutTab
          control={control}
          lockoutEnabled={lockoutEnabledWatch}
          lockoutThreshold={lockoutThresholdWatch}
          lockoutDurationValue={lockoutDurationValueWatch}
          lockoutDurationUnit={lockoutDurationUnitWatch}
          lockoutCounterResetValue={lockoutCounterResetValueWatch}
          lockoutCounterResetUnit={lockoutCounterResetUnitWatch}
        />
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
                tooltipText={
                  scope === "template"
                    ? "This field cannot be modified when using a template"
                    : "An optional PEM-encoded CA cert for the LDAP server. This is used by the TLS client for secure communication with the LDAP server."
                }
              >
                <TextArea
                  {...field}
                  placeholder="-----BEGIN CERTIFICATE----- ..."
                  className={scope === "template" ? "opacity-55" : ""}
                  isDisabled={scope === "template"}
                />
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
                      className="mb-0 grow"
                      label={index === 0 ? "Access Token Trusted IPs" : undefined}
                      isError={Boolean(error)}
                      errorText={error?.message}
                      tooltipText="The IPs or CIDR ranges that access tokens can be used from. By default, each token is given the 0.0.0.0/0, allowing usage from any network address."
                    >
                      <Input
                        value={field.value}
                        onChange={(e) => {
                          if (
                            subscription.get(SubscriptionProductCategory.Platform, "ipAllowlisting")
                          ) {
                            field.onChange(e);
                            return;
                          }

                          handlePopUpOpen("upgradePlan", {
                            featureName: "IP allowlisting"
                          });
                        }}
                        placeholder="123.456.789.0"
                      />
                    </FormControl>
                  );
                }}
              />
              <IconButton
                onClick={() => {
                  if (subscription.get(SubscriptionProductCategory.Platform, "ipAllowlisting")) {
                    removeAccessTokenTrustedIp(index);
                    return;
                  }

                  handlePopUpOpen("upgradePlan", {
                    featureName: "IP allowlisting"
                  });
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
                if (subscription.get(SubscriptionProductCategory.Platform, "ipAllowlisting")) {
                  appendAccessTokenTrustedIp({
                    ipAddress: "0.0.0.0/0"
                  });
                  return;
                }

                handlePopUpOpen("upgradePlan", {
                  featureName: "IP allowlisting"
                });
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
