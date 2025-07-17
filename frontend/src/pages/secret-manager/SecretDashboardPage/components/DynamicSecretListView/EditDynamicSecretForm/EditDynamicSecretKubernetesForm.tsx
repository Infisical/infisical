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
import { gatewaysQueryKeys, useUpdateDynamicSecret } from "@app/hooks/api";
import {
  KubernetesDynamicSecretCredentialType,
  TDynamicSecret
} from "@app/hooks/api/dynamicSecret/types";
import { slugSchema } from "@app/lib/schemas";

enum RoleType {
  ClusterRole = "cluster-role",
  Role = "role"
}

enum AuthMethod {
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
    inputs: z.discriminatedUnion("credentialType", [
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
      if (valMs > 24 * 60 * 60 * 1000)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than a day" });
    }),
    maxTTL: z
      .string()
      .optional()
      .superRefine((val, ctx) => {
        if (!val) return;
        const valMs = ms(val);
        if (valMs < 60 * 1000)
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
        if (valMs > 24 * 60 * 60 * 1000)
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than a day" });
      }),
    newName: slugSchema().optional(),
    usernameTemplate: z.string().trim().optional()
  })
  .superRefine((data, ctx) => {
    if (data.inputs.authMethod === AuthMethod.Gateway && !data.inputs.gatewayId) {
      ctx.addIssue({
        path: ["inputs.gatewayId"],
        code: z.ZodIssueCode.custom,
        message: "When auth method is set to Gateway, a gateway must be selected"
      });
    }
    if (data.inputs.authMethod === AuthMethod.Api) {
      if (!data.inputs.clusterToken) {
        ctx.addIssue({
          path: ["inputs.clusterToken"],
          code: z.ZodIssueCode.custom,
          message: "When auth method is set to Token, a cluster token must be provided"
        });
      }
      if (!data.inputs.url) {
        ctx.addIssue({
          path: ["inputs.url"],
          code: z.ZodIssueCode.custom,
          message: "When auth method is set to Token, a cluster URL must be provided"
        });
      }
    }
  });

type TForm = z.infer<typeof formSchema> & FieldValues;

type Props = {
  onClose: () => void;
  dynamicSecret: TDynamicSecret & { inputs: unknown };
  secretPath: string;
  projectSlug: string;
  environment: string;
};

export const EditDynamicSecretKubernetesForm = ({
  onClose,
  dynamicSecret,
  environment,
  secretPath,
  projectSlug
}: Props) => {
  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
    watch
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    values: {
      newName: dynamicSecret.name,
      defaultTTL: dynamicSecret.defaultTTL,
      usernameTemplate: dynamicSecret?.usernameTemplate || "{{randomUsername}}",
      maxTTL: dynamicSecret.maxTTL,
      inputs: dynamicSecret.inputs as TForm["inputs"]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "inputs.audiences"
  });

  const updateDynamicSecret = useUpdateDynamicSecret();
  const { data: gateways, isPending: isGatewaysLoading } = useQuery(gatewaysQueryKeys.list());

  const sslEnabled = watch("inputs.sslEnabled");
  const credentialType = watch("inputs.credentialType");
  const authMethod = watch("inputs.authMethod");

  const handleUpdateDynamicSecret = async (formData: TForm) => {
    // wait till previous request is finished
    if (updateDynamicSecret.isPending) return;
    const isDefaultUsernameTemplate = formData.usernameTemplate === "{{randomUsername}}";
    try {
      await updateDynamicSecret.mutateAsync({
        name: dynamicSecret.name,
        path: secretPath,
        projectSlug,
        environmentSlug: environment,
        data: {
          inputs: {
            ...formData.inputs,
            url: formData.inputs.url || undefined
          },
          newName: formData.newName === dynamicSecret.name ? undefined : formData.newName,
          defaultTTL: formData.defaultTTL,
          maxTTL: formData.maxTTL,
          usernameTemplate:
            !formData.usernameTemplate || isDefaultUsernameTemplate
              ? null
              : formData.usernameTemplate
        }
      });

      onClose();
      createNotification({
        type: "success",
        text: "Successfully updated dynamic secret"
      });
    } catch (err) {
      createNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update dynamic secret"
      });
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit(handleUpdateDynamicSecret)} autoComplete="off">
        <div>
          <div className="flex items-center space-x-2">
            <div className="flex-grow">
              <Controller
                control={control}
                defaultValue=""
                name="newName"
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
            <div className="mb-4 mt-4 border-b border-mineshaft-500 pb-2 pl-1 font-medium text-mineshaft-200">
              Configuration
            </div>
            <div className="flex flex-col">
              <div className="flex items-center space-x-2">
                <div className="flex-grow">
                  <div>
                    <OrgPermissionCan
                      I={OrgGatewayPermissionActions.AttachGateways}
                      a={OrgPermissionSubjects.Gateway}
                    >
                      {(isAllowed) => (
                        <Controller
                          control={control}
                          name="inputs.gatewayId"
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
                    name="inputs.authMethod"
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
                        name="inputs.url"
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
                                If enabled, you can optionally provide a custom CA certificate.
                                Leave blank to use the system/public CA.
                              </span>
                            }
                          >
                            <FontAwesomeIcon icon={faQuestionCircle} size="sm" className="ml-1" />
                          </Tooltip>
                        </span>
                        <Controller
                          name="inputs.sslEnabled"
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
                        name="inputs.ca"
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
                      name="inputs.clusterToken"
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
                    name="inputs.credentialType"
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
                          name="inputs.serviceAccountName"
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
                        name="inputs.namespace"
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
                          name="inputs.roleType"
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
                                <SelectItem
                                  value={RoleType.Role}
                                  key={`role-type-${RoleType.Role}`}
                                >
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
                          name="inputs.role"
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
                </div>
              </div>
              <div className="mt-2 w-1/2">
                <Controller
                  control={control}
                  name="inputs.audiences"
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
                              {...control.register(`inputs.audiences.${index}`)}
                              placeholder="Enter audience"
                              className="flex-grow"
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
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center space-x-4">
          <Button type="submit" isLoading={isSubmitting}>
            Submit
          </Button>
          <Button variant="outline_bg" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};
