import { useState } from "react";
import { Controller, FieldValues, useFieldArray, useForm } from "react-hook-form";
import { faQuestionCircle, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  FilterableSelect,
  FormControl,
  IconButton,
  Input,
  Select,
  SelectItem,
  Switch,
  TextArea,
  Tooltip
} from "@app/components/v2";
import { OrgPermissionSubjects } from "@app/context/OrgPermissionContext";
import { OrgGatewayPermissionActions } from "@app/context/OrgPermissionContext/types";
import { gatewaysQueryKeys, useCreateDynamicSecret } from "@app/hooks/api";
import {
  DynamicSecretProviders,
  KubernetesDynamicSecretCredentialType
} from "@app/hooks/api/dynamicSecret/types";
import { VaultKubernetesRole } from "@app/hooks/api/migration/types";
import { ProjectEnv } from "@app/hooks/api/types";
import { slugSchema } from "@app/lib/schemas";

import { LoadFromVaultBanner } from "./components/LoadFromVaultBanner";
import { VaultKubernetesImportModal } from "./VaultKubernetesImportModal";

enum RoleType {
  ClusterRole = "cluster-role",
  Role = "role"
}

export enum AuthMethod {
  Api = "api",
  Gateway = "gateway"
}

const credentialTypes = [
  {
    label: "Static",
    value: KubernetesDynamicSecretCredentialType.Static
  },
  {
    label: "Dynamic",
    value: KubernetesDynamicSecretCredentialType.Dynamic
  }
] as const;

const formSchema = z
  .object({
    provider: z.discriminatedUnion("credentialType", [
      z.object({
        url: z.string().trim().optional(),
        clusterToken: z.string().trim().optional(),
        ca: z.string().optional(),
        sslEnabled: z.boolean().default(false),
        credentialType: z.literal(KubernetesDynamicSecretCredentialType.Static),
        serviceAccountName: z.string().trim().min(1),
        namespace: z
          .string()
          .trim()
          .min(1)
          .refine(
            (val) => !val.includes(","),
            "Namespace must be a single value, not a comma-separated list"
          ),
        gatewayId: z.string().optional(),
        audiences: z.array(z.string().trim().min(1)),
        authMethod: z.nativeEnum(AuthMethod).default(AuthMethod.Api)
      }),
      z.object({
        url: z.string().trim().optional(),
        clusterToken: z.string().trim().optional(),
        ca: z.string().optional(),
        sslEnabled: z.boolean().default(false),
        credentialType: z.literal(KubernetesDynamicSecretCredentialType.Dynamic),
        namespace: z
          .string()
          .trim()
          .min(1)
          .refine((val) => {
            const namespaces = val.split(",").map((ns) => ns.trim());
            return namespaces.length > 0 && namespaces.every((ns) => ns.length > 0);
          }, "Must be a valid comma-separated list of namespace values"),
        gatewayId: z.string().optional(),
        audiences: z.array(z.string().trim().min(1)),
        roleType: z.nativeEnum(RoleType),
        role: z.string().trim().min(1),
        authMethod: z.nativeEnum(AuthMethod).default(AuthMethod.Api)
      })
    ]),
    defaultTTL: z.string().superRefine((val, ctx) => {
      const valMs = ms(val);
      if (valMs < 60 * 1000)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
      if (valMs > ms("10y"))
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than 10 years" });
    }),
    maxTTL: z
      .string()
      .optional()
      .superRefine((val, ctx) => {
        if (!val) return;
        const valMs = ms(val);
        if (valMs < 60 * 1000)
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
        if (valMs > ms("10y"))
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than 10 years" });
      }),
    name: slugSchema(),
    environment: z.object({ name: z.string(), slug: z.string() }),
    usernameTemplate: z.string().trim().optional()
  })
  .superRefine((data, ctx) => {
    if (data.provider.authMethod === AuthMethod.Gateway && !data.provider.gatewayId) {
      ctx.addIssue({
        path: ["provider.gatewayId"],
        code: z.ZodIssueCode.custom,
        message: "When auth method is set to Gateway, a gateway must be selected"
      });
    }
    if (data.provider.authMethod === AuthMethod.Api) {
      if (!data.provider.clusterToken) {
        ctx.addIssue({
          path: ["provider.clusterToken"],
          code: z.ZodIssueCode.custom,
          message: "When auth method is set to Token, a cluster token must be provided"
        });
      }
      if (!data.provider.url) {
        ctx.addIssue({
          path: ["provider.url"],
          code: z.ZodIssueCode.custom,
          message: "When auth method is set to Token, a cluster URL must be provided"
        });
      }
    }
  });

type TForm = z.infer<typeof formSchema> & FieldValues;

type Props = {
  onCompleted: () => void;
  onCancel: () => void;
  secretPath: string;
  projectSlug: string;
  environments: ProjectEnv[];
  isSingleEnvironmentMode?: boolean;
};

export const KubernetesInputForm = ({
  onCompleted,
  onCancel,
  secretPath,
  projectSlug,
  environments,
  isSingleEnvironmentMode
}: Props) => {
  const [isVaultImportModalOpen, setIsVaultImportModalOpen] = useState(false);

  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
    watch,
    setValue
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      provider: {
        url: "",
        clusterToken: "",
        ca: "",
        sslEnabled: false,
        serviceAccountName: "",
        namespace: "",
        credentialType: KubernetesDynamicSecretCredentialType.Static,
        gatewayId: undefined,
        audiences: [],
        authMethod: AuthMethod.Api
      } as const,
      environment: isSingleEnvironmentMode ? environments[0] : undefined
    }
  });

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "provider.audiences"
  });

  const createDynamicSecret = useCreateDynamicSecret();
  const { data: gateways, isPending: isGatewaysLoading } = useQuery(gatewaysQueryKeys.list());

  const sslEnabled = watch("provider.sslEnabled");
  const credentialType = watch("provider.credentialType");
  const authMethod = watch("provider.authMethod");

  const handleVaultImport = (role: VaultKubernetesRole) => {
    try {
      setValue("name", role.name);

      setValue("provider.url", role.config.kubernetes_host);

      // Set CA certificate if available
      if (role.config.kubernetes_ca_cert) {
        setValue("provider.ca", role.config.kubernetes_ca_cert);
        setValue("provider.sslEnabled", true);
      }

      // Determine credential type based on role configuration
      if (role.service_account_name) {
        // Static credential type
        setValue("provider.credentialType", KubernetesDynamicSecretCredentialType.Static);
        setValue("provider.serviceAccountName", role.service_account_name);

        // Set namespace (single namespace for static)
        if (role.allowed_kubernetes_namespaces && role.allowed_kubernetes_namespaces.length > 0) {
          setValue("provider.namespace", role.allowed_kubernetes_namespaces[0]);
        }
      } else if (role.kubernetes_role_name) {
        // Dynamic credential type
        setValue("provider.credentialType", KubernetesDynamicSecretCredentialType.Dynamic);
        setValue("provider.role", role.kubernetes_role_name);

        // Set role type
        const roleType =
          role.kubernetes_role_type === "ClusterRole" ? RoleType.ClusterRole : RoleType.Role;
        setValue("provider.roleType", roleType);

        // Set allowed namespaces (comma-separated for dynamic)
        if (role.allowed_kubernetes_namespaces && role.allowed_kubernetes_namespaces.length > 0) {
          setValue("provider.namespace", role.allowed_kubernetes_namespaces.join(", "));
        }
      }

      // Set TTLs if available
      if (role.token_default_ttl) {
        const defaultTTL = `${role.token_default_ttl}s`;
        setValue("defaultTTL", defaultTTL);
      }

      if (role.token_max_ttl) {
        const maxTTL = `${role.token_max_ttl}s`;
        setValue("maxTTL", maxTTL);
      }

      // Set audiences if available
      if (role.token_default_audiences && role.token_default_audiences.length > 0) {
        replace(role.token_default_audiences);
      }

      createNotification({
        type: "info",
        text: "Configuration loaded successfully from HashiCorp Vault"
      });
    } catch {
      createNotification({
        type: "error",
        text: "Failed to load configuration from HashiCorp Vault"
      });
    }
  };

  const handleCreateDynamicSecret = async (formData: TForm) => {
    const { provider, usernameTemplate, ...rest } = formData;
    // wait till previous request is finished
    if (createDynamicSecret.isPending) return;

    const isDefaultUsernameTemplate = usernameTemplate === "{{randomUsername}}";
    await createDynamicSecret.mutateAsync({
      provider: {
        type: DynamicSecretProviders.Kubernetes,
        inputs: {
          ...provider,
          url: provider.url || undefined
        }
      },
      maxTTL: rest.maxTTL,
      name: rest.name,
      path: secretPath,
      defaultTTL: rest.defaultTTL,
      projectSlug,
      environmentSlug: rest.environment.slug,
      usernameTemplate:
        !usernameTemplate || isDefaultUsernameTemplate ? undefined : usernameTemplate
    });

    onCompleted();
  };

  return (
    <form onSubmit={handleSubmit(handleCreateDynamicSecret)} autoComplete="off">
      <div>
        <LoadFromVaultBanner onClick={() => setIsVaultImportModalOpen(true)} />

        <div className="flex items-center space-x-2">
          <div className="grow">
            <Controller
              control={control}
              defaultValue=""
              name="name"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Secret Name"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <Input {...field} placeholder="dynamic-secret" />
                </FormControl>
              )}
            />
          </div>
          <div className="w-32">
            <Controller
              control={control}
              name="defaultTTL"
              defaultValue="1h"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label={<TtlFormLabel label="Default TTL" />}
                  isError={Boolean(error?.message)}
                  errorText={error?.message}
                >
                  <Input {...field} />
                </FormControl>
              )}
            />
          </div>
          <div className="w-32">
            <Controller
              control={control}
              name="maxTTL"
              defaultValue="24h"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label={<TtlFormLabel label="Max TTL" />}
                  isError={Boolean(error?.message)}
                  errorText={error?.message}
                >
                  <Input {...field} />
                </FormControl>
              )}
            />
          </div>
        </div>
        <div>
          <div className="mt-4 mb-4 border-b border-mineshaft-500 pb-2 pl-1">
            <h3 className="font-medium text-mineshaft-200">Configuration</h3>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center space-x-2">
              <div className="grow">
                <div>
                  <OrgPermissionCan
                    I={OrgGatewayPermissionActions.AttachGateways}
                    a={OrgPermissionSubjects.Gateway}
                  >
                    {(isAllowed) => (
                      <Controller
                        control={control}
                        name="provider.gatewayId"
                        defaultValue=""
                        render={({ field: { value, onChange }, fieldState: { error } }) => (
                          <FormControl
                            isError={Boolean(error?.message)}
                            errorText={error?.message}
                            label="Gateway"
                          >
                            <Tooltip
                              isDisabled={isAllowed}
                              content="Restricted access. You don't have permission to attach gateways to resources."
                            >
                              <div>
                                <Select
                                  isDisabled={!isAllowed}
                                  value={value}
                                  onValueChange={onChange}
                                  className="w-full border border-mineshaft-500"
                                  dropdownContainerClassName="max-w-none"
                                  isLoading={isGatewaysLoading}
                                  placeholder="Default: Internet Gateway"
                                  position="popper"
                                >
                                  <SelectItem
                                    value={null as unknown as string}
                                    onClick={() => onChange(undefined)}
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
                  name="provider.authMethod"
                  defaultValue={AuthMethod.Api}
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Auth Method"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                      className="w-full"
                      tooltipText="Select the method of authentication. Token (API) uses a direct API token, while Gateway uses the service account of a Gateway deployed in a Kubernetes cluster to generate the service account token."
                    >
                      <Select
                        defaultValue={field.value}
                        {...field}
                        className="w-full"
                        onValueChange={(e) => field.onChange(e)}
                      >
                        <SelectItem value={AuthMethod.Api}>Token (API)</SelectItem>
                        <SelectItem value={AuthMethod.Gateway}>Gateway</SelectItem>
                      </Select>
                    </FormControl>
                  )}
                />
                {authMethod === AuthMethod.Api && (
                  <>
                    <Controller
                      control={control}
                      name="provider.url"
                      render={({ field, fieldState: { error } }) => (
                        <FormControl
                          label="Cluster URL"
                          isError={Boolean(error?.message)}
                          errorText={error?.message}
                        >
                          <Input {...field} />
                        </FormControl>
                      )}
                    />
                    <div className="mb-2 flex items-center">
                      <span className="mr-3 flex items-center text-sm text-mineshaft-400">
                        Enable SSL
                        <Tooltip
                          className="ml-1 max-w-md"
                          content={
                            <span>
                              If enabled, you can optionally provide a custom CA certificate. Leave
                              blank to use the system/public CA.
                            </span>
                          }
                        >
                          <FontAwesomeIcon icon={faQuestionCircle} size="sm" className="ml-1" />
                        </Tooltip>
                      </span>
                      <Controller
                        name="provider.sslEnabled"
                        control={control}
                        render={({ field: { value, onChange } }) => (
                          <Switch
                            className="bg-mineshaft-400/50 shadow-inner data-[state=checked]:bg-green/80"
                            id="ssl-enabled"
                            thumbClassName="bg-mineshaft-800"
                            isChecked={value}
                            onCheckedChange={onChange}
                            aria-label="Enable SSL"
                          />
                        )}
                      />
                    </div>
                    <Controller
                      control={control}
                      name="provider.ca"
                      render={({ field, fieldState: { error } }) => (
                        <FormControl
                          label="CA"
                          isError={Boolean(error?.message)}
                          errorText={error?.message}
                          className={sslEnabled ? "" : "opacity-50"}
                        >
                          <TextArea
                            {...field}
                            placeholder="-----BEGIN CERTIFICATE----- ..."
                            isDisabled={!sslEnabled}
                          />
                        </FormControl>
                      )}
                    />
                  </>
                )}
                {authMethod === AuthMethod.Api && (
                  <Controller
                    control={control}
                    name="provider.clusterToken"
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        label="Cluster Token"
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                      >
                        <Input {...field} type="password" autoComplete="new-password" />
                      </FormControl>
                    )}
                  />
                )}
                <Controller
                  control={control}
                  name="provider.credentialType"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Credential Type"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                      className="w-full"
                      tooltipText="Choose 'Static' to generate service account tokens for a predefined service account. Choose 'Dynamic' to create a temporary service account, assign it to a defined role/cluster-role, and generate the service account token. Only 'Dynamic' supports role assignment."
                    >
                      <Select
                        defaultValue={field.value}
                        {...field}
                        className="w-full"
                        onValueChange={(e) => field.onChange(e)}
                      >
                        {credentialTypes.map((ct) => (
                          <SelectItem value={ct.value} key={`credential-type-${ct.value}`}>
                            {ct.label}
                          </SelectItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                />
                <div className="flex items-center space-x-2">
                  {credentialType === KubernetesDynamicSecretCredentialType.Static && (
                    <div className="flex-1">
                      <Controller
                        control={control}
                        name="provider.serviceAccountName"
                        render={({ field, fieldState: { error } }) => (
                          <FormControl
                            label="Service Account Name"
                            isError={Boolean(error?.message)}
                            errorText={error?.message}
                          >
                            <Input {...field} autoComplete="new-password" />
                          </FormControl>
                        )}
                      />
                    </div>
                  )}
                  {credentialType === KubernetesDynamicSecretCredentialType.Dynamic && (
                    <div className="flex-1">
                      <Controller
                        control={control}
                        name="usernameTemplate"
                        defaultValue="{{randomUsername}}"
                        render={({ field, fieldState: { error } }) => (
                          <FormControl
                            label="Username Template"
                            isError={Boolean(error?.message)}
                            errorText={error?.message}
                          >
                            <Input
                              {...field}
                              value={field.value || undefined}
                              className="border-mineshaft-600 bg-mineshaft-900 text-sm"
                            />
                          </FormControl>
                        )}
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <Controller
                      control={control}
                      name="provider.namespace"
                      render={({ field, fieldState: { error } }) => (
                        <FormControl
                          label={
                            credentialType === KubernetesDynamicSecretCredentialType.Static
                              ? "Namespace"
                              : "Allowed Namespace(s)"
                          }
                          isError={Boolean(error?.message)}
                          errorText={error?.message}
                        >
                          <Input {...field} />
                        </FormControl>
                      )}
                    />
                  </div>
                </div>
                {credentialType === KubernetesDynamicSecretCredentialType.Dynamic && (
                  <div className="flex items-center space-x-2">
                    <div className="flex-1">
                      <Controller
                        control={control}
                        name="provider.roleType"
                        defaultValue={RoleType.ClusterRole}
                        render={({ field, fieldState: { error } }) => (
                          <FormControl
                            label="Role Type"
                            isError={Boolean(error?.message)}
                            errorText={error?.message}
                          >
                            <Select
                              defaultValue={field.value}
                              {...field}
                              className="w-full"
                              onValueChange={(e) => field.onChange(e)}
                            >
                              <SelectItem
                                value={RoleType.ClusterRole}
                                key={`role-type-${RoleType.ClusterRole}`}
                              >
                                Cluster Role
                              </SelectItem>
                              <SelectItem value={RoleType.Role} key={`role-type-${RoleType.Role}`}>
                                Role
                              </SelectItem>
                            </Select>
                          </FormControl>
                        )}
                      />
                    </div>
                    <div className="flex-1">
                      <Controller
                        control={control}
                        name="provider.role"
                        render={({ field, fieldState: { error } }) => (
                          <FormControl
                            label="Role"
                            isError={Boolean(error?.message)}
                            errorText={error?.message}
                          >
                            <Input {...field} />
                          </FormControl>
                        )}
                      />
                    </div>
                  </div>
                )}
                <div className="mt-2 w-1/2">
                  <Controller
                    control={control}
                    name="provider.audiences"
                    render={({ fieldState: { error } }) => (
                      <FormControl
                        label="Audiences"
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                      >
                        <div className="space-y-2">
                          {fields.map((field, index) => (
                            <div key={field.id} className="flex items-center space-x-2">
                              <Input
                                {...control.register(`provider.audiences.${index}`)}
                                placeholder="Enter audience"
                                className="grow"
                              />
                              <IconButton
                                onClick={() => remove(index)}
                                variant="outline_bg"
                                ariaLabel="Remove audience"
                              >
                                <FontAwesomeIcon icon={faTrash} />
                              </IconButton>
                            </div>
                          ))}
                          <Button variant="outline_bg" onClick={() => append("")} type="button">
                            Add Audience
                          </Button>
                        </div>
                      </FormControl>
                    )}
                  />
                </div>
                {!isSingleEnvironmentMode && (
                  <Controller
                    control={control}
                    name="environment"
                    render={({ field: { value, onChange }, fieldState: { error } }) => (
                      <FormControl
                        label="Environment"
                        isError={Boolean(error)}
                        errorText={error?.message}
                      >
                        <FilterableSelect
                          options={environments}
                          value={value}
                          onChange={onChange}
                          placeholder="Select the environment to create secret in..."
                          getOptionLabel={(option) => option.name}
                          getOptionValue={(option) => option.slug}
                          menuPlacement="top"
                        />
                      </FormControl>
                    )}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center space-x-4">
        <Button type="submit" isLoading={isSubmitting}>
          Submit
        </Button>
        <Button variant="outline_bg" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <VaultKubernetesImportModal
        isOpen={isVaultImportModalOpen}
        onOpenChange={setIsVaultImportModalOpen}
        onImport={handleVaultImport}
      />
    </form>
  );
};
