import { useEffect, useMemo, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams } from "@tanstack/react-router";
import { HelpCircleIcon, InfoIcon, PlusIcon, XIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { BashGlobPatternTooltip } from "@app/components/permissions";
import {
  Button,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect,
  IconButton,
  Input,
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
import {
  accessTokenTtlSchema,
  DEFAULT_TRUSTED_IPS,
  mapTrustedIpsFromServer,
  superRefineAccessTokenTtl,
  trustedIpsSchema
} from "@app/helpers/identityAuthSchemas";
import { useScopeVariant } from "@app/hooks";
import { useAddIdentityOidcAuth, useUpdateIdentityOidcAuth } from "@app/hooks/api";
import { useGetIdentityOidcAuth } from "@app/hooks/api/identities/queries";
import { MachineIdentityAuthMethod } from "@app/hooks/api/identityAuthTemplates";
import { useGetAvailableTemplates } from "@app/hooks/api/identityAuthTemplates/queries";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { AccessTokenNumUsesLimitField } from "./shared/AccessTokenNumUsesLimitField";
import { AccessTokenTtlFields } from "./shared/AccessTokenTtlFields";
import { TrustedIpsField } from "./shared/TrustedIpsField";
import { IDENTITY_AUTH_FORM_ID, IdentityFormTab } from "./types";

const buildSchema = (maxAccessTokenTTL: number) =>
  z
    .object({
      scope: z.enum(["template", "custom"]),
      templateId: z.string().optional(),
      accessTokenTrustedIps: trustedIpsSchema,
      accessTokenTTL: accessTokenTtlSchema(maxAccessTokenTTL, "Access Token TTL"),
      accessTokenMaxTTL: accessTokenTtlSchema(maxAccessTokenTTL, "Access Token Max TTL"),
      accessTokenNumUsesLimit: z.string(),
      oidcDiscoveryUrl: z.string().optional(),
      caCert: z.string().trim().default(""),
      boundIssuer: z.string().optional(),
      boundAudiences: z.string().optional().default(""),
      boundClaims: z
        .array(
          z.object({
            key: z.string(),
            value: z.string()
          })
        )
        .default([]),
      claimMetadataMapping: z
        .array(
          z.object({
            key: z.string(),
            value: z.string()
          })
        )
        .default([]),
      boundSubject: z.string().optional().default("")
    })
    .superRefine((data, ctx) => {
      if (data.scope === "template") {
        if (!data.templateId) {
          ctx.addIssue({
            path: ["templateId"],
            code: z.ZodIssueCode.custom,
            message: "Template is required when using template scope"
          });
        }
        // the template only pins the issuer; a subject or claim binding is what scopes
        // this identity to specific workloads (mirrors the backend rule)
        const hasClaimBinding = data.boundClaims.some((claim) => claim.key.trim());
        if (!data.boundSubject && !hasClaimBinding) {
          ctx.addIssue({
            path: ["boundSubject"],
            code: z.ZodIssueCode.custom,
            message:
              "Set a subject or at least one claim binding to restrict which workloads can authenticate as this identity."
          });
        }
        return;
      }

      if (!data.oidcDiscoveryUrl) {
        ctx.addIssue({
          path: ["oidcDiscoveryUrl"],
          code: z.ZodIssueCode.custom,
          message: "OIDC discovery URL is required"
        });
      } else {
        if (!z.string().url().safeParse(data.oidcDiscoveryUrl).success) {
          ctx.addIssue({
            path: ["oidcDiscoveryUrl"],
            code: z.ZodIssueCode.custom,
            message: "OIDC discovery URL must be a valid URL"
          });
        }
        if (data.oidcDiscoveryUrl.endsWith("/.well-known/openid-configuration")) {
          ctx.addIssue({
            path: ["oidcDiscoveryUrl"],
            code: z.ZodIssueCode.custom,
            message: "Please remove /.well-known/openid-configuration."
          });
        }
      }
      if (!data.boundIssuer) {
        ctx.addIssue({
          path: ["boundIssuer"],
          code: z.ZodIssueCode.custom,
          message: "Issuer is required"
        });
      }
    })
    .superRefine(superRefineAccessTokenTtl);

export type FormData = z.infer<ReturnType<typeof buildSchema>>;

type ConfigurationOption = {
  group: "Configuration" | "Templates";
  label: string;
  value: string;
};

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["upgradePlan"]>,
    data?: { featureName?: string }
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

export const IdentityOidcAuthForm = ({
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
  const { mutateAsync: addMutateAsync } = useAddIdentityOidcAuth();
  const { mutateAsync: updateMutateAsync } = useUpdateIdentityOidcAuth();
  const [tabValue, setTabValue] = useState<IdentityFormTab>(IdentityFormTab.Configuration);
  const { permission } = useOrgPermission();

  const canAttachTemplates = permission.can(
    OrgPermissionMachineIdentityAuthTemplateActions.AttachTemplates,
    OrgPermissionSubjects.MachineIdentityAuthTemplate
  );

  const { data: templates, isLoading: isTemplatesLoading } = useGetAvailableTemplates(
    MachineIdentityAuthMethod.OIDC,
    { enabled: canAttachTemplates && Boolean(subscription?.machineIdentityAuthTemplates) }
  );

  const { data } = useGetIdentityOidcAuth(identityId ?? "", {
    enabled: isUpdate
  });

  const resolver = useMemo(() => zodResolver(buildSchema(maxAccessTokenTTL)), [maxAccessTokenTTL]);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    clearErrors,
    formState: { errors, isSubmitting }
  } = useForm<FormData>({
    resolver,
    defaultValues: {
      scope: "custom",
      templateId: "",
      accessTokenTTL: "2592000",
      accessTokenMaxTTL: "2592000",
      accessTokenNumUsesLimit: "",
      accessTokenTrustedIps: DEFAULT_TRUSTED_IPS,
      boundClaims: [],
      claimMetadataMapping: []
    }
  });

  const scope = watch("scope");
  const templateId = watch("templateId");

  const configurationOptions = useMemo<ConfigurationOption[]>(
    () => [
      {
        group: "Configuration",
        label: "Custom Configuration",
        value: "custom"
      },
      ...(templates ?? []).map((template) => ({
        group: "Templates" as const,
        label: template.name,
        value: template.id
      }))
    ],
    [templates]
  );

  const selectedConfiguration = configurationOptions.find(
    ({ value }) => value === (scope === "template" ? templateId : "custom")
  );

  const {
    fields: boundClaimsFields,
    append: appendBoundClaimField,
    remove: removeBoundClaimField
  } = useFieldArray({
    control,
    name: "boundClaims"
  });

  const {
    fields: claimMetadataMappingFields,
    append: appendClaimMetadataMappingField,
    remove: removeClaimMetadataMappingField
  } = useFieldArray({
    control,
    name: "claimMetadataMapping"
  });

  useEffect(() => {
    if (data) {
      reset({
        scope: data.templateId ? "template" : "custom",
        templateId: data.templateId || "",
        oidcDiscoveryUrl: data.oidcDiscoveryUrl,
        caCert: data.caCert,
        boundIssuer: data.boundIssuer,
        boundAudiences: data.boundAudiences,
        boundClaims: Object.entries(data.boundClaims).map(([key, value]) => ({
          key,
          value
        })),
        claimMetadataMapping: data?.claimMetadataMapping
          ? Object.entries(data.claimMetadataMapping).map(([key, value]) => ({
              key,
              value
            }))
          : undefined,
        boundSubject: data.boundSubject,
        accessTokenTTL: String(data.accessTokenTTL),
        accessTokenMaxTTL: String(data.accessTokenMaxTTL),
        accessTokenNumUsesLimit: data.accessTokenNumUsesLimit
          ? String(data.accessTokenNumUsesLimit)
          : "",
        accessTokenTrustedIps: mapTrustedIpsFromServer(data.accessTokenTrustedIps)
      });
    } else {
      reset({
        scope: "custom",
        templateId: "",
        oidcDiscoveryUrl: "",
        caCert: "",
        boundIssuer: "",
        boundAudiences: "",
        boundClaims: [],
        boundSubject: "",
        accessTokenTTL: "2592000",
        accessTokenMaxTTL: "2592000",
        accessTokenNumUsesLimit: "",
        accessTokenTrustedIps: DEFAULT_TRUSTED_IPS,
        claimMetadataMapping: []
      });
    }
  }, [data]);

  useEffect(() => {
    onSubmittingChange?.(isSubmitting);
  }, [isSubmitting, onSubmittingChange]);

  const onFormSubmit = async ({
    scope: submissionScope,
    templateId: submissionTemplateId,
    accessTokenTrustedIps,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    oidcDiscoveryUrl,
    caCert,
    boundIssuer,
    boundAudiences,
    boundClaims,
    claimMetadataMapping,
    boundSubject
  }: FormData) => {
    if (!identityId) {
      return;
    }

    const basePayload = {
      identityId,
      ...(projectId ? { projectId } : { organizationId: orgId }),
      boundClaims: Object.fromEntries(boundClaims.map((entry) => [entry.key, entry.value])),
      claimMetadataMapping: claimMetadataMapping
        ? Object.fromEntries(claimMetadataMapping.map((entry) => [entry.key, entry.value]))
        : undefined,
      boundSubject,
      accessTokenTTL: Number(accessTokenTTL),
      accessTokenMaxTTL: Number(accessTokenMaxTTL),
      accessTokenNumUsesLimit: Number(accessTokenNumUsesLimit || "0"),
      accessTokenTrustedIps
    };

    // the identity provider settings are template-managed while linked, so the template
    // payload must not carry them (the API rejects them alongside a templateId)
    if (data) {
      await updateMutateAsync(
        submissionScope === "template"
          ? { ...basePayload, templateId: submissionTemplateId }
          : {
              ...basePayload,
              // unlink an existing template so the custom values are accepted
              ...(data.templateId ? { templateId: null } : {}),
              oidcDiscoveryUrl,
              caCert,
              boundIssuer,
              boundAudiences
            }
      );
    } else {
      await addMutateAsync(
        submissionScope === "template"
          ? { ...basePayload, templateId: submissionTemplateId }
          : {
              ...basePayload,
              oidcDiscoveryUrl,
              caCert,
              boundIssuer,
              boundAudiences
            }
      );
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
        setTabValue(
          ["accessTokenTrustedIps", "caCert", "claimMetadataMapping"].includes(
            Object.keys(fields)[0]
          )
            ? IdentityFormTab.Advanced
            : IdentityFormTab.Configuration
        );
      })}
    >
      <Tabs value={tabValue} onValueChange={(value) => setTabValue(value as IdentityFormTab)}>
        <TabsList variant={scopeVariant}>
          <TabsTrigger value={IdentityFormTab.Configuration}>Configuration</TabsTrigger>
          <TabsTrigger value={IdentityFormTab.Advanced}>Advanced</TabsTrigger>
        </TabsList>
        <TabsContent value={IdentityFormTab.Configuration}>
          <FieldGroup>
            {canAttachTemplates && (
              <Controller
                control={control}
                name="scope"
                render={({ field: { onChange }, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel htmlFor="oidc-configuration">Configuration</FieldLabel>
                    <FilterableSelect<ConfigurationOption>
                      inputId="oidc-configuration"
                      value={selectedConfiguration}
                      options={configurationOptions}
                      groupBy="group"
                      getOptionLabel={(option) => option.label}
                      getOptionValue={(option) => option.value}
                      placeholder="Select or search configurations..."
                      isLoading={isTemplatesLoading}
                      isError={Boolean(error || errors.templateId)}
                      onChange={(option) => {
                        const selectedOption = option as ConfigurationOption | null;
                        if (!selectedOption) return;

                        if (selectedOption.value === "custom") {
                          onChange("custom");
                          setValue("templateId", "");
                          clearErrors("templateId");
                          setValue("oidcDiscoveryUrl", data?.oidcDiscoveryUrl || "");
                          setValue("boundIssuer", data?.boundIssuer || "");
                          setValue("boundAudiences", data?.boundAudiences || "");
                          setValue("caCert", data?.caCert || "");
                          return;
                        }

                        const template = templates?.find(({ id }) => id === selectedOption.value);
                        if (!template) return;

                        onChange("template");
                        setValue("templateId", template.id);
                        // template-managed fields become disabled, so any validation errors
                        // pinned to them are no longer actionable
                        clearErrors(["templateId", "oidcDiscoveryUrl", "boundIssuer", "caCert"]);
                        setValue("oidcDiscoveryUrl", template.templateFields.oidcDiscoveryUrl);
                        setValue("boundIssuer", template.templateFields.boundIssuer);
                        setValue("boundAudiences", template.templateFields.boundAudiences ?? "");
                        setValue("caCert", template.templateFields.caCert ?? "");
                      }}
                    />
                    <FieldError>{error?.message || errors.templateId?.message}</FieldError>
                  </Field>
                )}
              />
            )}
            <Controller
              control={control}
              name="oidcDiscoveryUrl"
              render={({ field, fieldState: { error } }) => (
                <Field className={templateDisabledClass}>
                  <FieldLabel
                    htmlFor="oidcDiscoveryUrl"
                    className="inline-flex items-center gap-1.5"
                  >
                    OIDC Discovery URL
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
                    id="oidcDiscoveryUrl"
                    placeholder="https://token.actions.githubusercontent.com"
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
              name="boundIssuer"
              render={({ field, fieldState: { error } }) => (
                <Field className={templateDisabledClass}>
                  <FieldLabel htmlFor="boundIssuer" className="inline-flex items-center gap-1.5">
                    Issuer
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
                    id="boundIssuer"
                    type="text"
                    placeholder="https://token.actions.githubusercontent.com"
                    disabled={scope === "template"}
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="boundSubject"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="boundSubject" className="inline-flex items-center gap-1.5">
                    Subject (optional)
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircleIcon className="size-3.5 text-muted" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md">
                        <BashGlobPatternTooltip />
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Input {...field} id="boundSubject" type="text" isError={Boolean(error)} />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="boundAudiences"
              render={({ field, fieldState: { error } }) => (
                <Field className={templateDisabledClass}>
                  <FieldLabel htmlFor="boundAudiences" className="inline-flex items-center gap-1.5">
                    Audiences (optional)
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircleIcon className="size-3.5 text-muted" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md">
                        {templateTooltipText || <BashGlobPatternTooltip />}
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Input
                    {...field}
                    id="boundAudiences"
                    type="text"
                    placeholder="service1, service2"
                    disabled={scope === "template"}
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <div className="flex flex-col gap-3">
              {boundClaimsFields.map(({ id }, index) => (
                <div className="flex items-start gap-2" key={id}>
                  <Controller
                    control={control}
                    name={`boundClaims.${index}.key`}
                    render={({ field, fieldState: { error } }) => (
                      <Field className="flex-1">
                        {index === 0 && (
                          <FieldLabel
                            htmlFor={`boundClaim-key-${index}`}
                            className="inline-flex items-center gap-1.5"
                          >
                            Claims
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircleIcon className="size-3.5 text-muted" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-md">
                                <BashGlobPatternTooltip />
                              </TooltipContent>
                            </Tooltip>
                          </FieldLabel>
                        )}
                        <Input
                          id={`boundClaim-key-${index}`}
                          value={field.value}
                          onChange={(e) => field.onChange(e)}
                          placeholder="property"
                          isError={Boolean(error)}
                        />
                        <FieldError>{error?.message}</FieldError>
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    name={`boundClaims.${index}.value`}
                    render={({ field, fieldState: { error } }) => (
                      <Field className="flex-1">
                        {index === 0 && (
                          <FieldLabel htmlFor={`boundClaim-value-${index}`} className="invisible">
                            Value
                          </FieldLabel>
                        )}
                        <Input
                          id={`boundClaim-value-${index}`}
                          value={field.value}
                          onChange={(e) => field.onChange(e)}
                          placeholder="value1, value2"
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
                    aria-label="Remove claim"
                    className={index === 0 ? "mt-[1.625rem]" : "mt-0.5"}
                    onClick={() => removeBoundClaimField(index)}
                  >
                    <XIcon />
                  </IconButton>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="w-fit"
                onClick={() =>
                  appendBoundClaimField({
                    key: "",
                    value: ""
                  })
                }
              >
                <PlusIcon />
                Add Claims
              </Button>
            </div>

            <AccessTokenTtlFields control={control} maxAccessTokenTTL={maxAccessTokenTTL} />
            <AccessTokenNumUsesLimitField control={control} />
          </FieldGroup>
        </TabsContent>
        <TabsContent value={IdentityFormTab.Advanced}>
          <FieldGroup>
            <Controller
              control={control}
              name="caCert"
              render={({ field, fieldState: { error } }) => (
                <Field className={templateDisabledClass}>
                  <FieldLabel htmlFor="caCert" className="inline-flex items-center gap-1.5">
                    CA Certificate (optional)
                    {templateTooltipText && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <InfoIcon className="size-3.5 text-muted" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-md">{templateTooltipText}</TooltipContent>
                      </Tooltip>
                    )}
                  </FieldLabel>
                  <TextArea
                    {...field}
                    id="caCert"
                    placeholder="-----BEGIN CERTIFICATE----- ..."
                    disabled={scope === "template"}
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />

            <div className="flex flex-col gap-3">
              {claimMetadataMappingFields.map(({ id }, index) => (
                <div className="flex items-start gap-2" key={id}>
                  <Controller
                    control={control}
                    name={`claimMetadataMapping.${index}.key`}
                    render={({ field, fieldState: { error } }) => (
                      <Field className="flex-1">
                        {index === 0 && (
                          <FieldLabel
                            htmlFor={`claimMetadata-key-${index}`}
                            className="inline-flex items-center gap-1.5"
                          >
                            Token Claim Mapping
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircleIcon className="size-3.5 text-muted" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-md">
                                <div className="flex flex-col gap-2">
                                  <p>Map OIDC token claims to identity metadata fields.</p>
                                  <div className="flex flex-col gap-2 border-t border-muted/50 pt-2">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="text-accent">Example:</span>
                                      <code className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-xs">
                                        role
                                      </code>
                                      <span className="text-accent">→</span>
                                      <code className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-xs">
                                        token.groups
                                      </code>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="text-accent">Becomes:</span>
                                      <code className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-xs">
                                        identity.metadata.oidc.claims.role
                                      </code>
                                    </div>
                                  </div>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </FieldLabel>
                        )}
                        <Input
                          id={`claimMetadata-key-${index}`}
                          value={field.value}
                          onChange={(e) => field.onChange(e)}
                          placeholder="Field name"
                          isError={Boolean(error)}
                        />
                        <FieldError>{error?.message}</FieldError>
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    name={`claimMetadataMapping.${index}.value`}
                    render={({ field, fieldState: { error } }) => (
                      <Field className="flex-1">
                        {index === 0 && (
                          <FieldLabel
                            htmlFor={`claimMetadata-value-${index}`}
                            className="invisible"
                          >
                            Value
                          </FieldLabel>
                        )}
                        <Input
                          id={`claimMetadata-value-${index}`}
                          value={field.value}
                          onChange={(e) => field.onChange(e)}
                          placeholder="Token claim"
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
                    aria-label="Remove claim mapping"
                    className={index === 0 ? "mt-[1.625rem]" : "mt-0.5"}
                    onClick={() => removeClaimMetadataMappingField(index)}
                  >
                    <XIcon />
                  </IconButton>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="w-fit"
                onClick={() =>
                  appendClaimMetadataMappingField({
                    key: "",
                    value: ""
                  })
                }
              >
                <PlusIcon />
                Add Token Mapping
              </Button>
            </div>

            <TrustedIpsField
              control={control}
              name="accessTokenTrustedIps"
              label="Access Token Trusted IPs"
              isAllowed={Boolean(subscription?.ipAllowlisting)}
              onUpgradeRequired={() =>
                handlePopUpOpen("upgradePlan", { featureName: "IP allowlisting" })
              }
            />
          </FieldGroup>
        </TabsContent>
      </Tabs>
    </form>
  );
};
