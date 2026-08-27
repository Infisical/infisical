import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams } from "@tanstack/react-router";
import { HelpCircleIcon, InfoIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect,
  GatewayPicker,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
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
  OrgGatewayPermissionActions,
  OrgPermissionMachineIdentityAuthTemplateActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import {
  accessTokenTtlSchema,
  DEFAULT_TRUSTED_IPS,
  mapTrustedIpsFromServer,
  superRefineAccessTokenTtl,
  superRefineKubernetesConnectionFields,
  trustedIpsSchema
} from "@app/helpers/identityAuthSchemas";
import { useScopeVariant } from "@app/hooks";
import {
  useAddIdentityKubernetesAuth,
  useGetIdentityKubernetesAuth,
  useUpdateIdentityKubernetesAuth
} from "@app/hooks/api";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  useListAppConnections,
  useListAvailableAppConnections
} from "@app/hooks/api/appConnections/queries";
import { IdentityKubernetesAuthTokenReviewMode } from "@app/hooks/api/identities/types";
import { MachineIdentityAuthMethod } from "@app/hooks/api/identityAuthTemplates";
import { useGetAvailableTemplates } from "@app/hooks/api/identityAuthTemplates/queries";
import { VaultKubernetesAuthRole } from "@app/hooks/api/migration/types";
import { useCanUseOrgAppConnectionImport } from "@app/hooks/useCanUseAppConnectionImport";
import { usePopUp, UsePopUpState } from "@app/hooks/usePopUp";

import { AccessTokenNumUsesLimitField } from "./shared/AccessTokenNumUsesLimitField";
import { AccessTokenTtlFields } from "./shared/AccessTokenTtlFields";
import { TrustedIpsField } from "./shared/TrustedIpsField";
import { IDENTITY_AUTH_FORM_ID, IdentityFormTab } from "./types";
import { VaultKubernetesAuthImportModal } from "./VaultKubernetesAuthImportModal";

const buildSchema = (maxAccessTokenTTL: number) =>
  z
    .object({
      scope: z.enum(["template", "custom"]),
      templateId: z.string().optional(),
      tokenReviewMode: z
        .nativeEnum(IdentityKubernetesAuthTokenReviewMode)
        .default(IdentityKubernetesAuthTokenReviewMode.Api),
      kubernetesHost: z.string().optional().nullable(),
      tokenReviewerJwt: z.string().optional(),
      gatewayId: z.string().optional().nullable(),
      gatewayPoolId: z.string().optional().nullable(),
      allowedNames: z.string(),
      allowedNamespaces: z.string(),
      allowedAudience: z.string(),
      caCert: z.string().optional(),
      verifyTlsCertificate: z.boolean().default(true),
      accessTokenTTL: accessTokenTtlSchema(maxAccessTokenTTL, "Access Token TTL"),
      accessTokenMaxTTL: accessTokenTtlSchema(maxAccessTokenTTL, "Access Token Max TTL"),
      accessTokenNumUsesLimit: z.string(),
      accessTokenTrustedIps: trustedIpsSchema
    })
    .superRefine((data, ctx) => {
      if (data.scope === "template") {
        if (!data.templateId) {
          ctx.addIssue({
            path: ["templateId"],
            code: z.ZodIssueCode.custom,
            message: "Template is required when using a template configuration"
          });
        }
        return;
      }

      superRefineKubernetesConnectionFields(data, ctx);
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

export const IdentityKubernetesAuthForm = ({
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
  const { mutateAsync: addMutateAsync } = useAddIdentityKubernetesAuth();
  const { mutateAsync: updateMutateAsync } = useUpdateIdentityKubernetesAuth();
  const [tabValue, setTabValue] = useState<IdentityFormTab>(IdentityFormTab.Configuration);
  const { permission } = useOrgPermission();

  const canAttachTemplates = permission.can(
    OrgPermissionMachineIdentityAuthTemplateActions.AttachTemplates,
    OrgPermissionSubjects.MachineIdentityAuthTemplate
  );

  const { data: templates, isPending: isTemplatesPending } = useGetAvailableTemplates(
    MachineIdentityAuthMethod.KUBERNETES,
    { enabled: canAttachTemplates && Boolean(subscription?.machineIdentityAuthTemplates) }
  );

  const { data } = useGetIdentityKubernetesAuth(identityId ?? "", {
    enabled: isUpdate
  });

  const { popUp, handlePopUpToggle: handleImportPopUpToggle } = usePopUp([
    "importFromVault"
  ] as const);
  const { data: projectVaultAppConnections = [] } = useListAvailableAppConnections(
    AppConnection.HCVault,
    projectId ?? "",
    { enabled: Boolean(projectId) }
  );
  const { data: orgAppConnections = [] } = useListAppConnections(undefined, {
    enabled: !projectId
  });
  const vaultAppConnections = useMemo(() => {
    if (projectId) return projectVaultAppConnections;
    return orgAppConnections.filter((c) => c.app === AppConnection.HCVault && !c.projectId);
  }, [projectId, projectVaultAppConnections, orgAppConnections]);
  const canUseAppConnectionImport = useCanUseOrgAppConnectionImport();
  const hasVaultConnection = vaultAppConnections.length > 0;

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
      tokenReviewMode: IdentityKubernetesAuthTokenReviewMode.Api,
      kubernetesHost: "",
      tokenReviewerJwt: "",
      allowedNames: "",
      allowedNamespaces: "",
      gatewayId: "",
      allowedAudience: "",
      caCert: "",
      verifyTlsCertificate: true,
      accessTokenTTL: "2592000",
      accessTokenMaxTTL: "2592000",
      accessTokenNumUsesLimit: "",
      accessTokenTrustedIps: DEFAULT_TRUSTED_IPS
    }
  });

  useEffect(() => {
    if (data) {
      reset({
        scope: data.templateId ? "template" : "custom",
        templateId: data.templateId || "",
        tokenReviewMode: data.tokenReviewMode,
        kubernetesHost: data.kubernetesHost,
        tokenReviewerJwt: data.tokenReviewerJwt,
        allowedNames: data.allowedNames,
        allowedNamespaces: data.allowedNamespaces,
        allowedAudience: data.allowedAudience,
        caCert: data.caCert,
        verifyTlsCertificate: data.verifyTlsCertificate ?? false,
        gatewayId: data.gatewayPoolId ? null : data.gatewayId || null,
        gatewayPoolId: data.gatewayPoolId || null,
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
        tokenReviewMode: IdentityKubernetesAuthTokenReviewMode.Api,
        kubernetesHost: "",
        tokenReviewerJwt: "",
        allowedNames: "",
        allowedNamespaces: "",
        allowedAudience: "",
        caCert: "",
        verifyTlsCertificate: true,
        accessTokenTTL: "2592000",
        accessTokenMaxTTL: "2592000",
        accessTokenNumUsesLimit: "",
        accessTokenTrustedIps: DEFAULT_TRUSTED_IPS
      });
    }
  }, [data]);

  const scope = watch("scope");
  const selectedTemplateId = watch("templateId");

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

  const selectedConfiguration =
    configurationOptions.find(
      ({ value }) => value === (scope === "template" ? selectedTemplateId : "custom")
    ) ??
    // while the template list is loading (or the linked template is missing from it), keep
    // the picker controlled and visibly linked so the user cannot mistake it for unset
    (scope === "template" && selectedTemplateId
      ? { group: "Templates" as const, label: "Linked template", value: selectedTemplateId }
      : undefined);

  useEffect(() => {
    onSubmittingChange?.(isSubmitting);
  }, [isSubmitting, onSubmittingChange]);

  const handleImportFromVault = (role: VaultKubernetesAuthRole) => {
    try {
      // importing a Vault role defines a custom configuration; drop any selected template
      // so the imported connection values are actually submitted
      setValue("scope", "custom");
      setValue("templateId", "");

      setValue("kubernetesHost", role.config.kubernetes_host, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true
      });

      if (role.bound_service_account_names?.length > 0) {
        setValue("allowedNames", role.bound_service_account_names.join(", "), {
          shouldDirty: true,
          shouldTouch: true
        });
      }

      if (role.bound_service_account_namespaces?.length > 0) {
        setValue("allowedNamespaces", role.bound_service_account_namespaces.join(", "), {
          shouldDirty: true,
          shouldTouch: true
        });
      }

      if (role.token_ttl !== undefined) {
        setValue("accessTokenTTL", String(role.token_ttl), {
          shouldDirty: true,
          shouldTouch: true
        });
      }

      if (role.token_max_ttl !== undefined) {
        setValue("accessTokenMaxTTL", String(role.token_max_ttl), {
          shouldDirty: true,
          shouldTouch: true
        });
      }

      if (role.token_num_uses !== undefined) {
        setValue("accessTokenNumUsesLimit", String(role.token_num_uses), {
          shouldDirty: true,
          shouldTouch: true
        });
      }

      if (role.audience) {
        setValue("allowedAudience", role.audience, {
          shouldDirty: true,
          shouldTouch: true
        });
      }

      if (role.config.kubernetes_ca_cert) {
        setValue("caCert", role.config.kubernetes_ca_cert, {
          shouldDirty: true,
          shouldTouch: true
        });
      }

      if (
        subscription?.ipAllowlisting &&
        role.token_bound_cidrs &&
        role.token_bound_cidrs.length > 0
      ) {
        setValue(
          "accessTokenTrustedIps",
          role.token_bound_cidrs.map((cidr) => ({ ipAddress: cidr })),
          {
            shouldDirty: true,
            shouldTouch: true
          }
        );
      }

      createNotification({
        type: "info",
        text: `Successfully prefilled values from Kubernetes auth role: ${role.name}`
      });
    } catch (err) {
      console.error("Import error:", err);
      createNotification({
        type: "error",
        text: "Failed to import Kubernetes auth configuration"
      });
    }
  };

  const onFormSubmit = async ({
    scope: submissionScope,
    templateId: submissionTemplateId,
    kubernetesHost,
    tokenReviewerJwt,
    allowedNames,
    allowedNamespaces,
    allowedAudience,
    caCert,
    verifyTlsCertificate,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    gatewayId,
    gatewayPoolId,
    tokenReviewMode,
    accessTokenTrustedIps
  }: FormData) => {
    if (!identityId) return;

    const basePayload = {
      ...(projectId ? { projectId } : { organizationId: orgId }),
      identityId,
      allowedNames: allowedNames || "",
      allowedNamespaces: allowedNamespaces || "",
      accessTokenTTL: Number(accessTokenTTL),
      accessTokenMaxTTL: Number(accessTokenMaxTTL),
      accessTokenNumUsesLimit: Number(accessTokenNumUsesLimit || "0"),
      accessTokenTrustedIps
    };

    const customConfigPayload = {
      ...(tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Api
        ? {
            kubernetesHost: kubernetesHost || ""
          }
        : {
            kubernetesHost: null
          }),
      allowedAudience: allowedAudience || "",
      gatewayId: gatewayPoolId ? null : gatewayId || null,
      gatewayPoolId: gatewayPoolId || null,
      verifyTlsCertificate,
      tokenReviewMode
    };

    if (data) {
      await updateMutateAsync(
        submissionScope === "template"
          ? { ...basePayload, templateId: submissionTemplateId }
          : {
              ...basePayload,
              ...customConfigPayload,
              // unlink an existing template so the custom values are accepted
              ...(data.templateId ? { templateId: null } : {}),
              // a blank field can only mean "clear" when the stored JWT was readable and
              // prefilled; template-sourced JWTs read back as "" so blank must keep them
              tokenReviewerJwt: tokenReviewerJwt || (data.tokenReviewerJwt ? null : undefined),
              caCert
            }
      );
    } else {
      await addMutateAsync(
        submissionScope === "template"
          ? { ...basePayload, templateId: submissionTemplateId }
          : {
              ...basePayload,
              ...customConfigPayload,
              tokenReviewerJwt: tokenReviewerJwt || undefined,
              caCert: caCert || ""
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

  const tokenReviewMode = watch("tokenReviewMode");
  const templateDisabledClass = scope === "template" ? "opacity-55" : "";

  return (
    <form
      id={IDENTITY_AUTH_FORM_ID}
      onSubmit={handleSubmit(onFormSubmit, (fields) => {
        setTabValue(
          [
            "scope",
            "templateId",
            "kubernetesHost",
            "tokenReviewerJwt",
            "tokenReviewMode",
            "gatewayId",
            "accessTokenTTL",
            "accessTokenMaxTTL",
            "accessTokenNumUsesLimit",
            "allowedNames",
            "allowedNamespaces"
          ].includes(Object.keys(fields)[0])
            ? IdentityFormTab.Configuration
            : IdentityFormTab.Advanced
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
            {hasVaultConnection && canUseAppConnectionImport && !isUpdate && (
              <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/10 p-3">
                <div className="flex items-start gap-2 text-sm">
                  <InfoIcon className="mt-0.5 size-4 text-primary" />
                  <span className="text-foreground">Load values from HashiCorp Vault</span>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => handleImportPopUpToggle("importFromVault", true)}
                        isDisabled={!canUseAppConnectionImport}
                      >
                        <img
                          src="/images/integrations/Vault.png"
                          alt="HashiCorp Vault"
                          className="h-4 w-4"
                        />
                        Load from Vault
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!canUseAppConnectionImport && (
                    <TooltipContent className="max-w-md">
                      You don&apos;t have permission to import configurations from HashiCorp Vault
                    </TooltipContent>
                  )}
                </Tooltip>
              </div>
            )}
            {canAttachTemplates && (
              <Controller
                control={control}
                name="scope"
                render={({ field: { onChange }, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel htmlFor="kubernetes-configuration">Configuration</FieldLabel>
                    <FilterableSelect<ConfigurationOption>
                      inputId="kubernetes-configuration"
                      value={selectedConfiguration}
                      options={configurationOptions}
                      groupBy="group"
                      getOptionLabel={(option) => option.label}
                      getOptionValue={(option) => option.value}
                      placeholder="Select or search configurations..."
                      isLoading={isTemplatesPending}
                      isError={Boolean(error || errors.templateId)}
                      onChange={(option) => {
                        const selectedOption = option as ConfigurationOption | null;
                        if (!selectedOption) return;

                        if (selectedOption.value === "custom") {
                          onChange("custom");
                          setValue("templateId", "");
                          clearErrors("templateId");
                          setValue(
                            "tokenReviewMode",
                            data?.tokenReviewMode || IdentityKubernetesAuthTokenReviewMode.Api
                          );
                          setValue("kubernetesHost", data?.kubernetesHost || "");
                          setValue("tokenReviewerJwt", data?.tokenReviewerJwt || "");
                          setValue(
                            "gatewayId",
                            data?.gatewayPoolId ? null : data?.gatewayId || null
                          );
                          setValue("gatewayPoolId", data?.gatewayPoolId || null);
                          setValue("caCert", data?.caCert || "");
                          setValue("verifyTlsCertificate", data?.verifyTlsCertificate ?? true);
                          setValue("allowedAudience", data?.allowedAudience || "");
                          return;
                        }

                        const template = templates?.find(({ id }) => id === selectedOption.value);
                        if (!template) return;

                        onChange("template");
                        setValue("templateId", template.id);
                        // template-managed fields become disabled, so any validation errors
                        // pinned to them are no longer actionable
                        clearErrors([
                          "templateId",
                          "kubernetesHost",
                          "caCert",
                          "verifyTlsCertificate",
                          "tokenReviewerJwt",
                          "gatewayId",
                          "gatewayPoolId"
                        ]);
                        const fields = template.templateFields;
                        setValue(
                          "tokenReviewMode",
                          fields.tokenReviewMode || IdentityKubernetesAuthTokenReviewMode.Api
                        );
                        setValue("kubernetesHost", fields.kubernetesHost || "");
                        setValue("tokenReviewerJwt", fields.tokenReviewerJwt || "");
                        setValue(
                          "gatewayId",
                          fields.gatewayPoolId ? null : fields.gatewayId || null
                        );
                        setValue("gatewayPoolId", fields.gatewayPoolId || null);
                        setValue("caCert", fields.caCert || "");
                        setValue(
                          "verifyTlsCertificate",
                          fields.verifyTlsCertificate ?? Boolean(fields.caCert)
                        );
                        setValue("allowedAudience", fields.allowedAudience || "");
                      }}
                    />
                    <FieldError>{error?.message || errors.templateId?.message}</FieldError>
                  </Field>
                )}
              />
            )}
            <OrgPermissionCan
              I={OrgGatewayPermissionActions.AttachGateways}
              a={OrgPermissionSubjects.Gateway}
            >
              {(isAllowed) => (
                <Controller
                  control={control}
                  name="gatewayId"
                  defaultValue=""
                  render={({ fieldState: { error } }) => {
                    const gatewayPoolIdVal = watch("gatewayPoolId");
                    const gatewayIdVal = watch("gatewayId");

                    return (
                      <Field className={templateDisabledClass}>
                        <FieldLabel htmlFor="gatewayId">Gateway (optional)</FieldLabel>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div>
                              <GatewayPicker
                                value={{
                                  gatewayId: gatewayIdVal || null,
                                  gatewayPoolId: gatewayPoolIdVal || null
                                }}
                                onChange={({ gatewayId: gwId, gatewayPoolId: poolId }) => {
                                  setValue("gatewayId", gwId, { shouldDirty: true });
                                  setValue("gatewayPoolId", poolId, { shouldDirty: true });
                                  if (!gwId && !poolId) {
                                    setValue(
                                      "tokenReviewMode",
                                      IdentityKubernetesAuthTokenReviewMode.Api,
                                      { shouldDirty: true, shouldTouch: true }
                                    );
                                  }
                                }}
                                isDisabled={!isAllowed || scope === "template"}
                                className="w-full"
                              />
                            </div>
                          </TooltipTrigger>
                          {!isAllowed && (
                            <TooltipContent className="max-w-md">
                              Restricted access. You don&apos;t have permission to attach gateways
                              to resources.
                            </TooltipContent>
                          )}
                        </Tooltip>
                        <FieldError>{error?.message}</FieldError>
                      </Field>
                    );
                  }}
                />
              )}
            </OrgPermissionCan>

            <Controller
              control={control}
              name="tokenReviewMode"
              render={({ field, fieldState: { error } }) => (
                <Field className={templateDisabledClass}>
                  <FieldLabel
                    htmlFor="tokenReviewMode"
                    className="inline-flex items-center gap-1.5"
                  >
                    Review Mode
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="size-3.5 text-muted" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md">
                        The method of which tokens are reviewed. If you select Gateway as Reviewer,
                        the selected gateway will be used to review tokens with. If this option is
                        enabled, the gateway must be deployed in Kubernetes, and the gateway must
                        have the system:auth-delegator ClusterRole binding.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={scope === "template"}
                  >
                    <SelectTrigger id="tokenReviewMode" isError={Boolean(error)}>
                      <SelectValue placeholder="Select review mode" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value="gateway">Gateway as Reviewer</SelectItem>
                      <SelectItem value="api">Manual Token Reviewer JWT (API)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            {tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Api && (
              <Controller
                control={control}
                defaultValue="2592000"
                name="kubernetesHost"
                render={({ field, fieldState: { error } }) => (
                  <Field className={templateDisabledClass}>
                    <FieldLabel
                      htmlFor="kubernetesHost"
                      className="inline-flex items-center gap-1.5"
                    >
                      Kubernetes Host / Base Kubernetes API URL
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <InfoIcon className="size-3.5 text-muted" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-md">
                          The host string, host:port pair, or URL to the base of the Kubernetes API
                          server. This can usually be obtained by running &apos;kubectl
                          cluster-info&apos;
                        </TooltipContent>
                      </Tooltip>
                    </FieldLabel>
                    <Input
                      {...field}
                      id="kubernetesHost"
                      placeholder="https://my-example-k8s-api-host.com"
                      type="text"
                      value={field.value || ""}
                      autoComplete="off"
                      disabled={scope === "template"}
                      isError={Boolean(error)}
                    />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
            )}

            {tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Api && (
              <Controller
                control={control}
                name="tokenReviewerJwt"
                render={({ field, fieldState: { error } }) => (
                  <Field className={templateDisabledClass}>
                    <FieldLabel
                      htmlFor="tokenReviewerJwt"
                      className="inline-flex items-center gap-1.5"
                    >
                      Token Reviewer JWT (optional)
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <InfoIcon className="size-3.5 text-muted" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-md">
                          Optional JWT token for accessing Kubernetes TokenReview API. If provided,
                          this long-lived token will be used to validate service account tokens
                          during authentication. If omitted, the client&apos;s own JWT will be used
                          instead, which requires the client to have the system:auth-delegator
                          ClusterRole binding.
                        </TooltipContent>
                      </Tooltip>
                    </FieldLabel>
                    <Input
                      {...field}
                      id="tokenReviewerJwt"
                      type="password"
                      autoComplete="new-password"
                      placeholder={
                        scope === "template" ? "Defined in template" : "eyJhbGciOiJSUzI1NiIs..."
                      }
                      disabled={scope === "template"}
                      isError={Boolean(error)}
                    />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
            )}
            <Controller
              control={control}
              defaultValue=""
              name="allowedNamespaces"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel
                    htmlFor="allowedNamespaces"
                    className="inline-flex items-center gap-1.5"
                  >
                    Allowed Namespaces (optional)
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="size-3.5 text-muted" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md">
                        <div className="flex flex-col gap-1">
                          <p>
                            A comma-separated list of trusted namespaces that service accounts must
                            belong to authenticate with Infisical.
                          </p>
                          <p>
                            Regex and Wildcard patterns are supported. Use{" "}
                            <span className="font-mono">*</span> to explicitly allow all.
                          </p>
                          <p className="text-sm">
                            Examples: <span className="font-mono">dev-*</span>,{" "}
                            <span className="font-mono">staging-*</span>,{" "}
                            <span className="font-mono">team-{"{a,b}"}</span>
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Input
                    {...field}
                    id="allowedNamespaces"
                    placeholder="namespaceA, namespaceB, dev-*"
                    type="text"
                    autoComplete="off"
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />

            <Controller
              control={control}
              name="allowedNames"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="allowedNames" className="inline-flex items-center gap-1.5">
                    Allowed Service Account Names (optional)
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="size-3.5 text-muted" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md">
                        <div className="flex flex-col gap-1">
                          <p>
                            An optional comma-separated list of trusted service account names that
                            are allowed to authenticate with Infisical. Leave empty to allow any
                            service account.
                          </p>
                          <p>
                            Regex and Wildcard patterns are supported. Use{" "}
                            <span className="font-mono">*</span> to explicitly allow all.
                          </p>
                          <p className="text-sm">
                            Examples: <span className="font-mono">dev-*</span>,{" "}
                            <span className="font-mono">staging-*</span>,{" "}
                            <span className="font-mono">team-{"{a,b}"}</span>
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Input
                    {...field}
                    id="allowedNames"
                    placeholder="service-account-1-name, sa-*, app-*-prod"
                    autoComplete="off"
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <AccessTokenTtlFields control={control} maxAccessTokenTTL={maxAccessTokenTTL} />
            <AccessTokenNumUsesLimitField control={control} />
          </FieldGroup>
        </TabsContent>
        <TabsContent value={IdentityFormTab.Advanced}>
          <FieldGroup>
            <Controller
              control={control}
              defaultValue=""
              name="allowedAudience"
              render={({ field, fieldState: { error } }) => (
                <Field className={templateDisabledClass}>
                  <FieldLabel
                    htmlFor="allowedAudience"
                    className="inline-flex items-center gap-1.5"
                  >
                    Allowed Audience (optional)
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="size-3.5 text-muted" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md">
                        An optional audience claim that the service account JWT token must have to
                        authenticate with Infisical. Leave empty to allow any audience claim.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Input
                    {...field}
                    id="allowedAudience"
                    type="text"
                    placeholder="https://kubernetes.default.svc"
                    disabled={scope === "template"}
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            {tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Api && (
              <>
                <Controller
                  control={control}
                  name="verifyTlsCertificate"
                  render={({ field: { value, onChange }, fieldState: { error } }) => {
                    const hasCaCert = Boolean(watch("caCert")?.length);
                    return (
                      <Field className={templateDisabledClass}>
                        <div className="flex items-center gap-2">
                          <Switch
                            id="k8s-verify-tls-certificate"
                            variant={scopeVariant}
                            checked={hasCaCert ? true : value}
                            onCheckedChange={onChange}
                            disabled={hasCaCert || scope === "template"}
                          />
                          <FieldLabel
                            htmlFor="k8s-verify-tls-certificate"
                            className="mb-0 inline-flex items-center gap-1.5"
                          >
                            Verify TLS Certificate
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircleIcon className="size-3.5 text-muted" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-md">
                                <div className="flex flex-col gap-2">
                                  {hasCaCert ? (
                                    <p>
                                      Verification is always on while a CA certificate is provided.
                                      To disable verification, clear the CA certificate field below.
                                    </p>
                                  ) : (
                                    <>
                                      <p>
                                        When enabled, Infisical validates the Kubernetes API
                                        server&apos;s TLS certificate against the CA certificate
                                        provided below.
                                      </p>
                                      <p>
                                        Leaving this disabled means any host that responds at the
                                        configured Kubernetes URL will be trusted, regardless of its
                                        certificate. The connection is still over HTTPS, but the API
                                        server&apos;s identity is not verified. Only do this for
                                        testing or if you cannot supply a CA certificate.
                                      </p>
                                    </>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </FieldLabel>
                        </div>
                        <FieldError>{error?.message}</FieldError>
                      </Field>
                    );
                  }}
                />
                <Controller
                  control={control}
                  name="caCert"
                  render={({ field, fieldState: { error } }) => {
                    const verifyTlsCertificate = watch("verifyTlsCertificate");
                    return (
                      <Field className={templateDisabledClass}>
                        <FieldLabel htmlFor="caCert" className="inline-flex items-center gap-1.5">
                          CA Certificate
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <InfoIcon className="size-3.5 text-muted" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-md">
                              The PEM-encoded CA certificate that issued the Kubernetes API
                              server&apos;s TLS certificate. Required when TLS certificate
                              verification is enabled. Providing a CA certificate forces TLS
                              verification on.
                            </TooltipContent>
                          </Tooltip>
                        </FieldLabel>
                        <TextArea
                          {...field}
                          id="caCert"
                          placeholder="-----BEGIN CERTIFICATE----- ..."
                          disabled={scope === "template"}
                          isError={Boolean(error)}
                          onChange={(e) => {
                            field.onChange(e);
                            if (e.target.value.length > 0 && !verifyTlsCertificate) {
                              setValue("verifyTlsCertificate", true, {
                                shouldDirty: true,
                                shouldValidate: true
                              });
                            }
                          }}
                        />
                        <FieldError>{error?.message}</FieldError>
                      </Field>
                    );
                  }}
                />
              </>
            )}
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
      <VaultKubernetesAuthImportModal
        isOpen={popUp.importFromVault.isOpen}
        onOpenChange={(isOpen) => handleImportPopUpToggle("importFromVault", isOpen)}
        appConnections={vaultAppConnections}
        onImport={handleImportFromVault}
      />
    </form>
  );
};
