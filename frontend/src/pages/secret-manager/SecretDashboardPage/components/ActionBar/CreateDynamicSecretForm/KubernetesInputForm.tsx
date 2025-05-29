import { Controller, FieldValues, useFieldArray, useForm } from "react-hook-form";
import {
  faArrowUpRightFromSquare,
  faBookOpen,
  faQuestionCircle,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
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
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";
import { WorkspaceEnv } from "@app/hooks/api/types";

enum CredentialType {
  Dynamic = "dynamic",
  Static = "static"
}

const credentialTypes = [
  {
    label: "Static",
    value: CredentialType.Static
  }
] as const;

const formSchema = z.object({
  provider: z.object({
    url: z.string().url().trim().min(1),
    clusterToken: z.string().trim().min(1),
    ca: z.string().optional(),
    sslEnabled: z.boolean().default(false),
    credentialType: z.literal(CredentialType.Static),
    serviceAccountName: z.string().trim().min(1),
    namespace: z.string().trim().min(1),
    gatewayId: z.string().optional(),
    audiences: z.array(z.string().trim().min(1))
  }),
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
  name: z.string().refine((val) => val.toLowerCase() === val, "Must be lowercase"),
  environment: z.object({ name: z.string(), slug: z.string() })
});

type TForm = z.infer<typeof formSchema> & FieldValues;

type Props = {
  onCompleted: () => void;
  onCancel: () => void;
  secretPath: string;
  projectSlug: string;
  environments: WorkspaceEnv[];
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
  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
    watch
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
        credentialType: CredentialType.Static,
        gatewayId: undefined,
        audiences: []
      },
      environment: isSingleEnvironmentMode ? environments[0] : undefined
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "provider.audiences"
  });

  const createDynamicSecret = useCreateDynamicSecret();
  const { data: gateways, isPending: isGatewaysLoading } = useQuery(gatewaysQueryKeys.list());

  const sslEnabled = watch("provider.sslEnabled");

  const handleCreateDynamicSecret = async (formData: TForm) => {
    const { provider, ...rest } = formData;
    // wait till previous request is finished
    if (createDynamicSecret.isPending) return;
    try {
      await createDynamicSecret.mutateAsync({
        provider: { type: DynamicSecretProviders.Kubernetes, inputs: provider },
        maxTTL: rest.maxTTL,
        name: rest.name,
        path: secretPath,
        defaultTTL: rest.defaultTTL,
        projectSlug,
        environmentSlug: rest.environment.slug
      });

      onCompleted();
    } catch {
      createNotification({
        type: "error",
        text: "Failed to create dynamic secret"
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(handleCreateDynamicSecret)} autoComplete="off">
      <div>
        <div className="flex items-center space-x-2">
          <div className="flex-grow">
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
          <div className="mb-4 mt-4 border-b border-mineshaft-500 pb-2 pl-1 font-medium text-mineshaft-200">
            Configuration
            <a
              href="https://infisical.com/docs/documentation/platform/dynamic-secrets/kubernetes"
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="mb-1 ml-2 inline-block cursor-default rounded-md bg-yellow/20 px-1.5 pb-[0.03rem] pt-[0.04rem] text-sm text-yellow opacity-80 hover:opacity-100">
                <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                Docs
                <FontAwesomeIcon
                  icon={faArrowUpRightFromSquare}
                  className="mb-[0.07rem] ml-1.5 text-xxs"
                />
              </div>
            </a>
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
                <Controller
                  control={control}
                  name="provider.credentialType"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Credential Type"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                      className="w-full"
                    >
                      <Select
                        defaultValue={field.value}
                        {...field}
                        className="w-full"
                        onValueChange={(e) => field.onChange(e)}
                      >
                        {credentialTypes.map((credentialType) => (
                          <SelectItem
                            value={credentialType.value}
                            key={`credential-type-${credentialType.value}`}
                          >
                            {credentialType.label}
                          </SelectItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                />
                <div className="flex items-center space-x-2">
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
                  <div className="flex-1">
                    <Controller
                      control={control}
                      name="provider.namespace"
                      render={({ field, fieldState: { error } }) => (
                        <FormControl
                          label="Namespace"
                          isError={Boolean(error?.message)}
                          errorText={error?.message}
                        >
                          <Input {...field} />
                        </FormControl>
                      )}
                    />
                  </div>
                </div>
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
    </form>
  );
};
