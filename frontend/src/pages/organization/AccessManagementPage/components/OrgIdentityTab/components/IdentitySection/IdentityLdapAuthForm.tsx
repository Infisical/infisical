import { useEffect, useMemo, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams } from "@tanstack/react-router";
import {
  HelpCircleIcon,
  InfoIcon,
  PlusIcon,
  TriangleAlertIcon,
  UserRoundCheckIcon,
  UsersRoundIcon,
  XIcon
} from "lucide-react";
import ms from "ms";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
  IconButton,
  Input,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization, useOrgPermission, useSubscription } from "@app/context";
import {
  OrgPermissionMachineIdentityAuthTemplateActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { getObjectFromSeconds } from "@app/helpers/datetime";
import {
  accessTokenTtlSchema,
  DEFAULT_TRUSTED_IPS,
  mapTrustedIpsFromServer,
  superRefineAccessTokenTtl,
  trustedIpsSchema
} from "@app/helpers/identityAuthSchemas";
import { useScopeVariant } from "@app/hooks";
import {
  MachineIdentityAuthMethod,
  useAddIdentityLdapAuth,
  useGetIdentityLdapAuth,
  useUpdateIdentityLdapAuth
} from "@app/hooks/api";
import { useGetAvailableTemplates } from "@app/hooks/api/identityAuthTemplates/queries";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { LOCKOUT_DEFAULT_VALUES } from "./lockout/constants";
import { LockoutTab } from "./lockout/LockoutTab";
import { superRefineLockout } from "./lockout/super-refine";
import { AccessTokenNumUsesLimitField } from "./shared/AccessTokenNumUsesLimitField";
import { AccessTokenTtlFields } from "./shared/AccessTokenTtlFields";
import { TrustedIpsField } from "./shared/TrustedIpsField";
import { IDENTITY_AUTH_FORM_ID, IdentityFormTab } from "./types";

const buildSchema = (maxAccessTokenTTL: number) =>
  z
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
      userAccess: z.enum(["restricted", "all"]),
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

      accessTokenTTL: accessTokenTtlSchema(maxAccessTokenTTL, "Access Token TTL"),
      accessTokenMaxTTL: accessTokenTtlSchema(maxAccessTokenTTL, "Access Token Max TTL"),
      accessTokenNumUsesLimit: z.string(),
      accessTokenTrustedIps: trustedIpsSchema,

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

      if (data.userAccess === "restricted") {
        if (!data.allowedFields || data.allowedFields.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Add at least one required attribute, or allow any directory user",
            path: ["allowedFields"]
          });
        }

        data.allowedFields?.forEach((field, index) => {
          if (!field.key) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Attribute key is required",
              path: ["allowedFields", index, "key"]
            });
          }
          if (!field.value) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Attribute value is required",
              path: ["allowedFields", index, "value"]
            });
          }
        });
      }

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
    })
    .superRefine(superRefineAccessTokenTtl);

export type FormData = z.infer<ReturnType<typeof buildSchema>>;

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
  maxAccessTokenTTL: number;
  onSubmittingChange?: (isSubmitting: boolean) => void;
};

export const IdentityLdapAuthForm = ({
  handlePopUpOpen,
  handlePopUpToggle,
  identityId,
  isUpdate,
  maxAccessTokenTTL,
  onSubmittingChange
}: Props) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { subscription } = useSubscription();
  const { projectId } = useParams({
    strict: false
  });
  const scopeVariant = useScopeVariant();
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

  const resolver = useMemo(() => zodResolver(buildSchema(maxAccessTokenTTL)), [maxAccessTokenTTL]);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    trigger,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver,
    defaultValues: {
      scope: "custom",
      templateId: "",
      url: "",
      bindDN: "",
      bindPass: "",
      searchBase: "",
      searchFilter: "(uid={{username}})",
      userAccess: "restricted",
      allowedFields: [{ key: "", value: "" }],
      accessTokenTTL: "2592000",
      accessTokenMaxTTL: "2592000",
      accessTokenNumUsesLimit: "",
      accessTokenTrustedIps: DEFAULT_TRUSTED_IPS,
      ...LOCKOUT_DEFAULT_VALUES
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
    fields: allowedFieldsFields,
    append: appendAllowedField,
    remove: removeAllowedField,
    replace: replaceAllowedFields
  } = useFieldArray({ control, name: "allowedFields" });

  const userAccess = watch("userAccess");

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
        userAccess: data.allowedFields && data.allowedFields.length > 0 ? "restricted" : "all",
        allowedFields: data.allowedFields || [],
        accessTokenTTL: String(data.accessTokenTTL),
        accessTokenMaxTTL: String(data.accessTokenMaxTTL),
        accessTokenNumUsesLimit: data.accessTokenNumUsesLimit
          ? String(data.accessTokenNumUsesLimit)
          : "",
        accessTokenTrustedIps: mapTrustedIpsFromServer(data.accessTokenTrustedIps),
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
      userAccess: "restricted",
      allowedFields: [{ key: "", value: "" }],
      accessTokenTTL: "2592000",
      accessTokenMaxTTL: "2592000",
      accessTokenNumUsesLimit: "",
      accessTokenTrustedIps: DEFAULT_TRUSTED_IPS,
      ...LOCKOUT_DEFAULT_VALUES
    });
  }, [data, reset]);

  useEffect(() => {
    onSubmittingChange?.(isSubmitting);
  }, [isSubmitting, onSubmittingChange]);

  useEffect(() => {
    if (!subscription?.ldap) {
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
      userAccess: submissionUserAccess,
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

    // "Allow any directory user" clears the attribute restriction entirely.
    const submissionAllowedFields = submissionUserAccess === "all" ? [] : allowedFields;

    const basePayload = {
      ...(projectId ? { projectId } : { organizationId: orgId }),
      identityId,
      searchFilter,
      ldapCaCertificate,
      allowedFields: submissionAllowedFields,
      accessTokenTTL: Number(accessTokenTTL),
      accessTokenMaxTTL: Number(accessTokenMaxTTL),
      accessTokenNumUsesLimit: Number(accessTokenNumUsesLimit || "0"),
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

  const templateTooltipText =
    scope === "template" ? "This field cannot be modified when using a template" : null;
  const templateDisabledClass = scope === "template" ? "opacity-55" : "";

  return (
    <form
      id={IDENTITY_AUTH_FORM_ID}
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
        <TabsList variant={scopeVariant}>
          <TabsTrigger value={IdentityFormTab.Configuration}>Configuration</TabsTrigger>
          <TabsTrigger value={IdentityFormTab.Lockout}>Lockout</TabsTrigger>
          <TabsTrigger value={IdentityFormTab.Advanced}>Advanced</TabsTrigger>
        </TabsList>
        <TabsContent value={IdentityFormTab.Configuration}>
          <FieldGroup>
            {canAttachTemplates && (
              <Controller
                control={control}
                name="scope"
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel htmlFor="ldap-scope">Configuration Type</FieldLabel>
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
                    >
                      <SelectTrigger id="ldap-scope" className="w-full" isError={Boolean(error)}>
                        <SelectValue placeholder="Select configuration type" />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        <SelectItem value="template">Use Template</SelectItem>
                        <SelectItem value="custom">Custom Configuration</SelectItem>
                      </SelectContent>
                    </Select>
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
            )}

            {scope === "template" && (
              <Controller
                control={control}
                name="templateId"
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel htmlFor="ldap-template">Template</FieldLabel>
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
                    >
                      <SelectTrigger id="ldap-template" className="w-full" isError={Boolean(error)}>
                        <SelectValue placeholder="Select a template" />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {templates?.map((template) => {
                          return (
                            <SelectItem value={template.id} key={template.id}>
                              {template.name}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
            )}

            <Controller
              control={control}
              name="url"
              render={({ field, fieldState: { error } }) => (
                <Field className={templateDisabledClass}>
                  <FieldLabel htmlFor="url" className="inline-flex items-center gap-1.5">
                    LDAP URL
                    {templateTooltipText && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <InfoIcon className="size-3.5 text-muted" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-md">{templateTooltipText}</TooltipContent>
                      </Tooltip>
                    )}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="url"
                    placeholder="ldaps://domain-or-ip:636"
                    type="text"
                    disabled={scope === "template"}
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="bindDN"
              render={({ field, fieldState: { error } }) => (
                <Field className={templateDisabledClass}>
                  <FieldLabel htmlFor="bindDN" className="inline-flex items-center gap-1.5">
                    Bind DN
                    {templateTooltipText && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <InfoIcon className="size-3.5 text-muted" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-md">{templateTooltipText}</TooltipContent>
                      </Tooltip>
                    )}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="bindDN"
                    placeholder="cn=infisical,ou=Users,dc=example,dc=com"
                    disabled={scope === "template"}
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="bindPass"
              render={({ field, fieldState: { error } }) => (
                <Field className={templateDisabledClass}>
                  <FieldLabel htmlFor="bindPass" className="inline-flex items-center gap-1.5">
                    Bind Pass
                    {templateTooltipText && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <InfoIcon className="size-3.5 text-muted" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-md">{templateTooltipText}</TooltipContent>
                      </Tooltip>
                    )}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="bindPass"
                    placeholder="********"
                    type="password"
                    disabled={scope === "template"}
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="searchBase"
              render={({ field, fieldState: { error } }) => (
                <Field className={templateDisabledClass}>
                  <FieldLabel htmlFor="searchBase" className="inline-flex items-center gap-1.5">
                    Search Base / DN
                    {templateTooltipText && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <InfoIcon className="size-3.5 text-muted" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-md">{templateTooltipText}</TooltipContent>
                      </Tooltip>
                    )}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="searchBase"
                    placeholder="ou=machines,dc=acme,dc=com"
                    disabled={scope === "template"}
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />

            <Controller
              control={control}
              name="searchFilter"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="searchFilter">Search Filter</FieldLabel>
                  <Input
                    {...field}
                    id="searchFilter"
                    placeholder="(uid={{username}})"
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />

            <Controller
              control={control}
              name="userAccess"
              render={({ field: { value, onChange } }) => (
                <Field>
                  <FieldLabel className="inline-flex items-center gap-1.5">
                    User access
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircleIcon className="size-3.5 text-muted" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-sm">
                        Choose whether only directory users matching the required attributes may
                        authenticate as this identity, or any user who can bind to the directory.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <FieldDescription>
                    Choose which directory users may assume this identity.
                  </FieldDescription>
                  <RadioGroup
                    className="grid grid-cols-2 gap-3"
                    value={value}
                    onValueChange={(next) => {
                      onChange(next);
                      if (next === "restricted" && allowedFieldsFields.length === 0) {
                        replaceAllowedFields([{ key: "", value: "" }]);
                      }
                    }}
                  >
                    <FieldLabel htmlFor="user-access-restricted" variant={scopeVariant}>
                      <Field orientation="horizontal">
                        <FieldContent>
                          <FieldTitle>
                            <UserRoundCheckIcon />
                            Restrict
                          </FieldTitle>
                          <FieldDescription>Match on the attributes</FieldDescription>
                        </FieldContent>
                        <RadioGroupItem value="restricted" id="user-access-restricted" />
                      </Field>
                    </FieldLabel>
                    <FieldLabel htmlFor="user-access-all" variant={scopeVariant}>
                      <Field orientation="horizontal">
                        <FieldContent>
                          <FieldTitle>
                            <UsersRoundIcon />
                            Allow any
                          </FieldTitle>
                          <FieldDescription>Anyone who can bind</FieldDescription>
                        </FieldContent>
                        <RadioGroupItem value="all" id="user-access-all" />
                      </Field>
                    </FieldLabel>
                  </RadioGroup>
                </Field>
              )}
            />

            {userAccess === "all" ? (
              <Alert variant="warning">
                <TriangleAlertIcon />
                <AlertTitle>All directory users can authenticate</AlertTitle>
                <AlertDescription>
                  Every user in the configured LDAP directory who can bind will be able to
                  authenticate as this identity. Switch to &quot;Restrict&quot; to limit access.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="flex flex-col gap-3">
                <FieldLabel className="inline-flex items-center gap-1.5">
                  Authorized user attributes
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircleIcon className="size-3.5 text-muted" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-md">
                      <div className="max-h-[300px] space-y-4 overflow-y-auto text-sm">
                        <p>
                          Only directory users whose LDAP entry matches every attribute below are
                          authorized to authenticate as this identity.
                        </p>
                        <p>
                          You can allow multiple values for an attribute by separating them with a
                          comma.
                        </p>
                        <div className="space-y-2">
                          <p>Example:</p>
                          <p className="text-xs font-bold">
                            &apos;uid&apos; → &apos;user1,user2,user3&apos;
                            <br />
                            &apos;mail&apos; → &apos;user@example.com&apos;
                          </p>
                        </div>
                        <p>
                          The above example would allow users with the UID user1, user2, or user3 to
                          authenticate but only if their emails also match user@example.com
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </FieldLabel>
                {allowedFieldsFields.map(({ id }, index) => (
                  <div className="flex items-start gap-2" key={id}>
                    <Controller
                      control={control}
                      name={`allowedFields.${index}.key`}
                      render={({ field, fieldState: { error } }) => (
                        <Field className="flex-1">
                          <Input
                            id={`allowedField-key-${index}`}
                            value={field.value}
                            onChange={(e) => field.onChange(e)}
                            placeholder="uid"
                            isError={Boolean(error)}
                          />
                          <FieldError>{error?.message}</FieldError>
                        </Field>
                      )}
                    />
                    <Controller
                      control={control}
                      name={`allowedFields.${index}.value`}
                      render={({ field, fieldState: { error } }) => (
                        <Field className="flex-1">
                          <Input
                            id={`allowedField-value-${index}`}
                            value={field.value}
                            onChange={(e) => field.onChange(e)}
                            placeholder="userid1,userid2,userid3"
                            isError={Boolean(error)}
                          />
                          <FieldError>{error?.message}</FieldError>
                        </Field>
                      )}
                    />
                    <IconButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label="Remove required attribute"
                      className="mt-0.5"
                      onClick={() => removeAllowedField(index)}
                    >
                      <XIcon />
                    </IconButton>
                  </div>
                ))}
                {allowedFieldsFields.length === 0 && (
                  <FieldError>Add at least one attribute, or allow any directory user.</FieldError>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="w-fit"
                  onClick={() =>
                    appendAllowedField({
                      key: "",
                      value: ""
                    })
                  }
                >
                  <PlusIcon />
                  Add attribute
                </Button>
              </div>
            )}

            <AccessTokenTtlFields control={control} maxAccessTokenTTL={maxAccessTokenTTL} />
            <AccessTokenNumUsesLimitField control={control} />
          </FieldGroup>
        </TabsContent>
        <LockoutTab
          control={control}
          trigger={trigger}
          lockoutEnabled={lockoutEnabledWatch}
          lockoutThreshold={lockoutThresholdWatch}
          lockoutDurationValue={lockoutDurationValueWatch}
          lockoutDurationUnit={lockoutDurationUnitWatch}
          lockoutCounterResetValue={lockoutCounterResetValueWatch}
          lockoutCounterResetUnit={lockoutCounterResetUnitWatch}
        />
        <TabsContent value={IdentityFormTab.Advanced}>
          <FieldGroup>
            <Controller
              control={control}
              name="ldapCaCertificate"
              render={({ field, fieldState: { error } }) => (
                <Field className={templateDisabledClass}>
                  <FieldLabel
                    htmlFor="ldapCaCertificate"
                    className="inline-flex items-center gap-1.5"
                  >
                    CA Certificate (optional)
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="size-3.5 text-muted" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md">
                        {templateTooltipText ||
                          "An optional PEM-encoded CA cert for the LDAP server. This is used by the TLS client for secure communication with the LDAP server."}
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <TextArea
                    {...field}
                    id="ldapCaCertificate"
                    placeholder="-----BEGIN CERTIFICATE----- ..."
                    disabled={scope === "template"}
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />

            <TrustedIpsField
              control={control}
              name="accessTokenTrustedIps"
              label="Access Token Trusted IPs"
              isAllowed={Boolean(subscription?.ipAllowlisting)}
              onUpgradeRequired={() =>
                handlePopUpOpen("upgradePlan", { featureName: "IP allowlisting" })
              }
              tooltip="The IPs or CIDR ranges that access tokens can be used from. By default, each token is given the 0.0.0.0/0, allowing usage from any network address."
            />
          </FieldGroup>
        </TabsContent>
      </Tabs>
    </form>
  );
};
