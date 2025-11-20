import { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faInfoCircle, faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
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
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { OrgMembershipRole } from "@app/helpers/roles";
import {
  gatewaysQueryKeys,
  useAddIdentityKubernetesAuth,
  useGetIdentityKubernetesAuth,
  useUpdateIdentityKubernetesAuth
} from "@app/hooks/api";
import {
  IdentityKubernetesAuthTokenReviewMode,
  IdentityTrustedIp
} from "@app/hooks/api/identities/types";
import { useGetVaultExternalMigrationConfigs } from "@app/hooks/api/migration/queries";
import { VaultKubernetesAuthRole } from "@app/hooks/api/migration/types";
import { usePopUp, UsePopUpState } from "@app/hooks/usePopUp";

import { IdentityFormTab } from "./types";
import { VaultKubernetesAuthImportModal } from "./VaultKubernetesAuthImportModal";

const schema = z
  .object({
    tokenReviewMode: z
      .nativeEnum(IdentityKubernetesAuthTokenReviewMode)
      .default(IdentityKubernetesAuthTokenReviewMode.Api),
    kubernetesHost: z.string().optional().nullable(),
    tokenReviewerJwt: z.string().optional(),
    gatewayId: z.string().optional().nullable(),
    allowedNames: z.string(),
    allowedNamespaces: z.string(),
    allowedAudience: z.string(),
    caCert: z.string().optional(),
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
  .superRefine((data, ctx) => {
    if (
      data.tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Api &&
      !data.kubernetesHost?.length
    ) {
      ctx.addIssue({
        path: ["kubernetesHost"],
        code: z.ZodIssueCode.custom,
        message: "When token review mode is set to API, a Kubernetes host must be provided"
      });
    }

    if (data.tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Gateway && !data.gatewayId) {
      ctx.addIssue({
        path: ["gatewayId"],
        code: z.ZodIssueCode.custom,
        message: "When token review mode is set to Gateway, a gateway must be selected"
      });
    }
  });

export type FormData = z.infer<typeof schema>;

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
};

export const IdentityKubernetesAuthForm = ({
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
  const { mutateAsync: addMutateAsync } = useAddIdentityKubernetesAuth();
  const { mutateAsync: updateMutateAsync } = useUpdateIdentityKubernetesAuth();
  const [tabValue, setTabValue] = useState<IdentityFormTab>(IdentityFormTab.Configuration);

  const { data: gateways, isPending: isGatewayLoading } = useQuery(gatewaysQueryKeys.list());

  const { data } = useGetIdentityKubernetesAuth(identityId ?? "", {
    enabled: isUpdate
  });

  const { popUp, handlePopUpToggle: handleImportPopUpToggle } = usePopUp([
    "importFromVault"
  ] as const);
  const { data: vaultConfigs = [] } = useGetVaultExternalMigrationConfigs();
  const hasVaultConnection = vaultConfigs.some((config) => config.connectionId);
  const { hasOrgRole } = useOrgPermission();
  const isOrgAdmin = hasOrgRole(OrgMembershipRole.Admin);

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
      tokenReviewMode: IdentityKubernetesAuthTokenReviewMode.Api,
      kubernetesHost: "",
      tokenReviewerJwt: "",
      allowedNames: "",
      allowedNamespaces: "",
      gatewayId: "",
      allowedAudience: "",
      caCert: "",
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

  useEffect(() => {
    if (data) {
      reset({
        tokenReviewMode: data.tokenReviewMode,
        kubernetesHost: data.kubernetesHost,
        tokenReviewerJwt: data.tokenReviewerJwt,
        allowedNames: data.allowedNames,
        allowedNamespaces: data.allowedNamespaces,
        allowedAudience: data.allowedAudience,
        caCert: data.caCert,
        gatewayId: data.gatewayId || null,
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
        tokenReviewMode: IdentityKubernetesAuthTokenReviewMode.Api,
        kubernetesHost: "",
        tokenReviewerJwt: "",
        allowedNames: "",
        allowedNamespaces: "",
        allowedAudience: "",
        caCert: "",
        accessTokenTTL: "2592000",
        accessTokenMaxTTL: "2592000",
        accessTokenNumUsesLimit: "0",
        accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }]
      });
    }
  }, [data]);

  const handleImportFromVault = (role: VaultKubernetesAuthRole) => {
    try {
      setValue("kubernetesHost", role.config.kubernetes_host, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true
      });

      if (role.bound_service_account_names?.length > 0) {
        // In Vault, "*" means allow all; in Infisical, empty field means allow any
        const allowedNames = role.bound_service_account_names.includes("*")
          ? ""
          : role.bound_service_account_names.join(", ");
        setValue("allowedNames", allowedNames, {
          shouldDirty: true,
          shouldTouch: true
        });
      }

      if (role.bound_service_account_namespaces?.length > 0) {
        // In Vault, "*" means allow all; in Infisical, empty field means allow any
        const allowedNamespaces = role.bound_service_account_namespaces.includes("*")
          ? ""
          : role.bound_service_account_namespaces.join(", ");
        setValue("allowedNamespaces", allowedNamespaces, {
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
    kubernetesHost,
    tokenReviewerJwt,
    allowedNames,
    allowedNamespaces,
    allowedAudience,
    caCert,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    gatewayId,
    tokenReviewMode,
    accessTokenTrustedIps
  }: FormData) => {
    if (!identityId) return;

    if (data) {
      await updateMutateAsync({
        ...(projectId ? { projectId } : { organizationId: orgId }),
        ...(tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Api
          ? {
              kubernetesHost: kubernetesHost || ""
            }
          : {
              kubernetesHost: null
            }),
        tokenReviewerJwt: tokenReviewerJwt || null,
        allowedNames,
        allowedNamespaces,
        allowedAudience,
        caCert,
        identityId,
        gatewayId: gatewayId || null,
        tokenReviewMode,
        accessTokenTTL: Number(accessTokenTTL),
        accessTokenMaxTTL: Number(accessTokenMaxTTL),
        accessTokenNumUsesLimit: Number(accessTokenNumUsesLimit),
        accessTokenTrustedIps
      });
    } else {
      await addMutateAsync({
        ...(projectId ? { projectId } : { organizationId: orgId }),
        identityId,
        ...(tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Api
          ? {
              kubernetesHost: kubernetesHost || ""
            }
          : {
              kubernetesHost: null
            }),
        tokenReviewerJwt: tokenReviewerJwt || undefined,
        allowedNames: allowedNames || "",
        allowedNamespaces: allowedNamespaces || "",
        allowedAudience: allowedAudience || "",
        gatewayId: gatewayId || null,
        caCert: caCert || "",
        tokenReviewMode,
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
  };

  const tokenReviewMode = watch("tokenReviewMode");

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit, (fields) => {
        setTabValue(
          [
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
        <TabList>
          <Tab value={IdentityFormTab.Configuration}>Configuration</Tab>
          <Tab value={IdentityFormTab.Advanced}>Advanced</Tab>
        </TabList>
        <TabPanel value={IdentityFormTab.Configuration}>
          {hasVaultConnection && !isUpdate && (
            <div className="mb-4 flex items-center justify-between rounded-md border border-primary/30 bg-primary/10 p-3">
              <div className="flex items-start gap-2 text-sm">
                <FontAwesomeIcon icon={faInfoCircle} className="mt-0.5 text-primary" />
                <span className="text-mineshaft-200">Load values from HashiCorp Vault</span>
              </div>
              <Tooltip
                content={
                  !isOrgAdmin
                    ? "Only organization admins can import configurations from HashiCorp Vault"
                    : undefined
                }
              >
                <Button
                  variant="outline_bg"
                  size="xs"
                  leftIcon={
                    <img
                      src="/images/integrations/Vault.png"
                      alt="HashiCorp Vault"
                      className="h-4 w-4"
                    />
                  }
                  onClick={() => handleImportPopUpToggle("importFromVault", true)}
                  isDisabled={!isOrgAdmin}
                >
                  Load from Vault
                </Button>
              </Tooltip>
            </div>
          )}
          <div className="flex w-full items-center gap-2">
            <div className="w-full flex-1">
              <OrgPermissionCan
                I={OrgGatewayPermissionActions.AttachGateways}
                a={OrgPermissionSubjects.Gateway}
              >
                {(isAllowed) => (
                  <Controller
                    control={control}
                    name="gatewayId"
                    defaultValue=""
                    render={({ field: { value, onChange }, fieldState: { error } }) => (
                      <FormControl
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                        label="Gateway"
                        isOptional
                      >
                        <Tooltip
                          isDisabled={isAllowed}
                          content="Restricted access. You don't have permission to attach gateways to resources."
                        >
                          <div>
                            <Select
                              isDisabled={!isAllowed}
                              value={value as string}
                              onValueChange={(v) => {
                                if (v !== "") {
                                  onChange(v);
                                }

                                if (v === null) {
                                  setValue(
                                    "tokenReviewMode",
                                    IdentityKubernetesAuthTokenReviewMode.Api,
                                    {
                                      shouldDirty: true,
                                      shouldTouch: true
                                    }
                                  );
                                }
                              }}
                              className="w-full border border-mineshaft-500"
                              dropdownContainerClassName="max-w-none"
                              isLoading={isGatewayLoading}
                              placeholder="Default: Internet Gateway"
                              position="popper"
                            >
                              <SelectItem
                                value={null as unknown as string}
                                onClick={() => {
                                  onChange(null);
                                }}
                              >
                                Internet Gateway
                              </SelectItem>
                              {gateways?.map((el) => (
                                <SelectItem value={el.id} key={el.id}>
                                  {el.name}
                                </SelectItem>
                              ))}
                            </Select>
                          </div>
                        </Tooltip>
                      </FormControl>
                    )}
                  />
                )}
              </OrgPermissionCan>
            </div>

            <Controller
              control={control}
              name="tokenReviewMode"
              render={({ field }) => (
                <FormControl
                  tooltipClassName="max-w-md"
                  tooltipText="The method of which tokens are reviewed. If you select Gateway as Reviewer, the selected gateway will be used to review tokens with. If this option is enabled, the gateway must be deployed in Kubernetes, and the gateway must have the system:auth-delegator ClusterRole binding."
                  label="Review Mode"
                >
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectItem value="gateway">Gateway as Reviewer</SelectItem>
                    <SelectItem value="api">Manual Token Reviewer JWT (API)</SelectItem>
                  </Select>
                </FormControl>
              )}
            />
          </div>
          {tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Api && (
            <Controller
              control={control}
              defaultValue="2592000"
              name="kubernetesHost"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Kubernetes Host / Base Kubernetes API URL "
                  isError={Boolean(error)}
                  errorText={error?.message}
                  tooltipText="The host string, host:port pair, or URL to the base of the Kubernetes API server. This can usually be obtained by running 'kubectl cluster-info'"
                  isRequired
                >
                  <Input
                    {...field}
                    placeholder="https://my-example-k8s-api-host.com"
                    type="text"
                    value={field.value || ""}
                    autoComplete="off"
                  />
                </FormControl>
              )}
            />
          )}

          {tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Api && (
            <Controller
              control={control}
              name="tokenReviewerJwt"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  tooltipClassName="max-w-md"
                  label="Token Reviewer JWT"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  tooltipText="Optional JWT token for accessing Kubernetes TokenReview API. If provided, this long-lived token will be used to validate service account tokens during authentication. If omitted, the client's own JWT will be used instead, which requires the client to have the system:auth-delegator ClusterRole binding."
                >
                  <Input {...field} placeholder="" type="password" autoComplete="new-password" />
                </FormControl>
              )}
            />
          )}
          <Controller
            control={control}
            defaultValue=""
            name="allowedNamespaces"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Allowed Namespaces"
                isError={Boolean(error)}
                errorText={error?.message}
                tooltipText="A comma-separated list of trusted namespaces that service accounts must belong to authenticate with Infisical."
              >
                <Input
                  {...field}
                  placeholder="namespaceA, namespaceB"
                  type="text"
                  autoComplete="off"
                />
              </FormControl>
            )}
          />

          <Controller
            control={control}
            name="allowedNames"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Allowed Service Account Names"
                isError={Boolean(error)}
                tooltipText="An optional comma-separated list of trusted service account names that are allowed to authenticate with Infisical. Leave empty to allow any service account."
                errorText={error?.message}
              >
                <Input
                  {...field}
                  placeholder="service-account-1-name, service-account-1-name"
                  autoComplete="off"
                />
              </FormControl>
            )}
          />
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
            defaultValue=""
            name="allowedAudience"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Allowed Audience"
                isError={Boolean(error)}
                errorText={error?.message}
                tooltipText="An optional audience claim that the service account JWT token must have to authenticate with Infisical. Leave empty to allow any audience claim."
              >
                <Input {...field} placeholder="" type="text" />
              </FormControl>
            )}
          />
          {tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Api && (
            <Controller
              control={control}
              name="caCert"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="CA Certificate"
                  errorText={error?.message}
                  isError={Boolean(error)}
                  tooltipText="An optional PEM-encoded CA cert for the Kubernetes API server. This is used by the TLS client for secure communication with the Kubernetes API server."
                >
                  <TextArea {...field} placeholder="-----BEGIN CERTIFICATE----- ..." />
                </FormControl>
              )}
            />
          )}
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
                          if (subscription?.ipAllowlisting) {
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
                  if (subscription?.ipAllowlisting) {
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
                if (subscription?.ipAllowlisting) {
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
      <VaultKubernetesAuthImportModal
        isOpen={popUp.importFromVault.isOpen}
        onOpenChange={(isOpen) => handleImportPopUpToggle("importFromVault", isOpen)}
        onImport={handleImportFromVault}
      />
    </form>
  );
};
