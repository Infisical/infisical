import { Controller, useForm } from "react-hook-form";
import { SingleValue } from "react-select";
import {
  faCheckCircle,
  faCircleNotch,
  faTriangleExclamation
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, FilterableSelect, FormControl, Input, SecretInput } from "@app/components/v2";
import { Tooltip } from "@app/components/v2/Tooltip";
import { GatewayPicker } from "@app/components/v3/platform/GatewayPicker";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { useCreateDynamicSecret } from "@app/hooks/api";
import {
  useGetIbmApiConnectOrgApps,
  useGetIbmApiConnectOrgCatalogs,
  useGetIbmApiConnectOrgs
} from "@app/hooks/api/dynamicSecret/queries";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";
import { ProjectEnv } from "@app/hooks/api/types";

const validateTTL = (val: string, ctx: z.RefinementCtx) => {
  if (!val) return;
  const valMs = ms(val);
  if (valMs === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid TTL format" });
    return;
  }
  if (valMs < 1000)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1 second" });
};

const formSchema = z
  .object({
    provider: z.object({
      clientId: z.string().trim().min(1, "Client ID is required"),
      clientSecret: z.string().trim().min(1, "Client Secret is required"),
      instanceUrl: z.string().url("Must be a valid URL").trim().min(1, "Instance URL is required"),
      apiKey: z.string().trim().min(1, "API Key is required"),
      orgId: z.string().trim().min(1, "Organization is required"),
      catalogId: z.string().trim().min(1, "Catalog is required"),
      consumerOrgId: z.string().trim().min(1, "Consumer Organization is required"),
      appId: z.string().trim().min(1, "Application is required"),
      gatewayId: z.string().optional(),
      gatewayPoolId: z.string().optional()
    }),
    defaultTTL: z.string().superRefine(validateTTL),
    maxTTL: z
      .string()
      .optional()
      .superRefine((val, ctx) => {
        if (val) validateTTL(val, ctx);
      }),
    name: z.string().refine((val) => val.toLowerCase() === val, "Must be lowercase"),
    environment: z.object({ name: z.string(), slug: z.string() })
  })
  .refine((d) => !d.maxTTL || ms(d.maxTTL)! >= ms(d.defaultTTL)!, {
    path: ["maxTTL"],
    message: "Max TTL must be greater than or equal to Default TTL"
  });
type TForm = z.infer<typeof formSchema>;

type Props = {
  onCompleted: () => void;
  onCancel: () => void;
  secretPath: string;
  projectSlug: string;
  environments: ProjectEnv[];
  isSingleEnvironmentMode?: boolean;
};

export const IbmApiConnectInputForm = ({
  onCompleted,
  onCancel,
  environments,
  secretPath,
  projectSlug,
  isSingleEnvironmentMode
}: Props) => {
  const {
    control,
    formState: { isSubmitting },
    watch,
    setValue,
    handleSubmit
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      environment: isSingleEnvironmentMode && environments.length > 0 ? environments[0] : undefined
    }
  });

  const instanceUrl = watch("provider.instanceUrl");
  const apiKey = watch("provider.apiKey");
  const clientId = watch("provider.clientId");
  const clientSecret = watch("provider.clientSecret");
  const orgId = watch("provider.orgId");
  const catalogId = watch("provider.catalogId");

  const credentialsComplete = !!(instanceUrl && apiKey && clientId && clientSecret);
  const orgSelected = credentialsComplete && !!orgId;
  const catalogSelected = orgSelected && !!catalogId;

  const {
    data: orgs,
    isFetching: isOrgsFetching,
    isError: isOrgsError
  } = useGetIbmApiConnectOrgs({
    instanceUrl: instanceUrl || "",
    apiKey: apiKey || "",
    clientId: clientId || "",
    clientSecret: clientSecret || "",
    enabled: credentialsComplete
  });

  const selectedOrg = orgs?.find((o) => o.id === orgId);

  const {
    data: catalogs,
    isFetching: isCatalogsFetching,
    isError: isCatalogsError
  } = useGetIbmApiConnectOrgCatalogs({
    instanceUrl: instanceUrl || "",
    apiKey: apiKey || "",
    clientId: clientId || "",
    clientSecret: clientSecret || "",
    orgId: selectedOrg?.id || "",
    enabled: orgSelected
  });

  const selectedCatalog = catalogs?.find((c) => c.id === catalogId);

  const {
    data: apps,
    isFetching: isAppsFetching,
    isError: isAppsError
  } = useGetIbmApiConnectOrgApps({
    instanceUrl: instanceUrl || "",
    apiKey: apiKey || "",
    clientId: clientId || "",
    clientSecret: clientSecret || "",
    orgId: selectedOrg?.id || "",
    catalogId: selectedCatalog?.id || "",
    enabled: catalogSelected
  });

  const createDynamicSecret = useCreateDynamicSecret();

  const handleCreateDynamicSecret = async ({
    name,
    maxTTL,
    provider,
    defaultTTL,
    environment
  }: TForm) => {
    if (createDynamicSecret.isPending) return;
    await createDynamicSecret.mutateAsync({
      provider: {
        type: DynamicSecretProviders.IbmApiConnect,
        inputs: {
          ...provider
        }
      },
      maxTTL,
      name,
      path: secretPath,
      defaultTTL,
      projectSlug,
      environmentSlug: environment.slug
    });
    onCompleted();
  };

  const getOrgTooltipContent = () => {
    if (!credentialsComplete) return "Fill in all credentials above first";
    if (isOrgsError) return "Failed to load organizations — check your credentials";
    return undefined;
  };

  const getCatalogTooltipContent = () => {
    if (!orgSelected) return "Select an organization first";
    if (isCatalogsError) return "Failed to load catalogs";
    return undefined;
  };

  const getAppTooltipContent = () => {
    if (!catalogSelected) return "Select a catalog first";
    if (isAppsError) return "Failed to load applications";
    return undefined;
  };

  const getStatusIndicator = (isComplete: boolean, isFetching: boolean, isError: boolean) => {
    if (!isComplete) return null;
    if (isFetching)
      return <FontAwesomeIcon icon={faCircleNotch} className="animate-spin text-primary" />;
    if (isError) return <FontAwesomeIcon icon={faTriangleExclamation} className="text-red-500" />;
    return <FontAwesomeIcon icon={faCheckCircle} className="text-green-500" />;
  };

  return (
    <div>
      <form onSubmit={handleSubmit(handleCreateDynamicSecret)} autoComplete="off">
        <div>
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
            <div className="mt-4 mb-4 border-b border-mineshaft-500 pb-2 pl-1 font-medium text-mineshaft-200">
              Configuration
            </div>

            <OrgPermissionCan
              I={OrgGatewayPermissionActions.AttachGateways}
              a={OrgPermissionSubjects.Gateway}
            >
              {(isAllowed) => (
                <FormControl label="Gateway">
                  <Tooltip
                    isDisabled={isAllowed}
                    content="Restricted access. You don't have permission to attach gateways to resources."
                  >
                    <div>
                      <GatewayPicker
                        isDisabled={!isAllowed}
                        value={{
                          gatewayId: watch("provider.gatewayId") ?? null,
                          gatewayPoolId: watch("provider.gatewayPoolId") ?? null
                        }}
                        onChange={({ gatewayId: newGwId, gatewayPoolId: newPoolId }) => {
                          setValue("provider.gatewayId", newGwId ?? undefined, {
                            shouldDirty: true
                          });
                          setValue("provider.gatewayPoolId", newPoolId ?? undefined, {
                            shouldDirty: true
                          });
                        }}
                      />
                    </div>
                  </Tooltip>
                </FormControl>
              )}
            </OrgPermissionCan>

            <div className="flex flex-col">
              <Controller
                control={control}
                name="provider.instanceUrl"
                defaultValue=""
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Instance URL"
                    className="grow"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    isRequired
                  >
                    <Input
                      placeholder="https://platform-api.trial.apiconnect.automation.ibm.com"
                      {...field}
                    />
                  </FormControl>
                )}
              />

              <Controller
                control={control}
                name="provider.apiKey"
                defaultValue=""
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="API Key"
                    className="grow"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    isRequired
                  >
                    <SecretInput
                      {...field}
                      containerClassName="text-gray-400 group-focus-within:border-primary-400/50! border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
                    />
                  </FormControl>
                )}
              />

              <Controller
                control={control}
                name="provider.clientId"
                defaultValue=""
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Client ID"
                    className="grow"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    isRequired
                  >
                    <Input placeholder="" {...field} />
                  </FormControl>
                )}
              />

              <Controller
                control={control}
                name="provider.clientSecret"
                defaultValue=""
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Client Secret"
                    className="grow"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    isRequired
                  >
                    <SecretInput
                      {...field}
                      containerClassName="text-gray-400 group-focus-within:border-primary-400/50! border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
                    />
                  </FormControl>
                )}
              />
            </div>

            <div className="mt-4 mb-4 border-b border-mineshaft-500 pb-2 pl-1 font-medium text-mineshaft-200">
              <div className="flex items-center space-x-2">
                <span>Organization, Catalog & Application</span>
                {getStatusIndicator(credentialsComplete, isOrgsFetching, isOrgsError)}
              </div>
            </div>

            <Controller
              control={control}
              name="provider.orgId"
              defaultValue=""
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  label="Organization"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  isRequired
                >
                  <Tooltip
                    content={getOrgTooltipContent()}
                    isDisabled={credentialsComplete && !isOrgsError}
                  >
                    <div>
                      <FilterableSelect
                        isDisabled={!credentialsComplete || isOrgsFetching || isOrgsError}
                        isLoading={isOrgsFetching}
                        options={orgs ?? []}
                        value={orgs?.find((o) => o.id === value) ?? null}
                        onChange={(opt) => {
                          const option = opt as SingleValue<NonNullable<typeof orgs>[number]>;
                          onChange(option?.id ?? "");
                          setValue("provider.catalogId", "");
                          setValue("provider.consumerOrgId", "");
                          setValue("provider.appId", "");
                        }}
                        placeholder="Select an organization..."
                        getOptionLabel={(option) => option.title || option.name}
                        getOptionValue={(option) => option.id}
                      />
                    </div>
                  </Tooltip>
                </FormControl>
              )}
            />

            <Controller
              control={control}
              name="provider.catalogId"
              defaultValue=""
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  label={
                    <div className="flex items-center space-x-2">
                      <span>Catalog</span>
                      {getStatusIndicator(orgSelected, isCatalogsFetching, isCatalogsError)}
                    </div>
                  }
                  isError={Boolean(error)}
                  errorText={error?.message}
                  isRequired
                >
                  <Tooltip
                    content={getCatalogTooltipContent()}
                    isDisabled={orgSelected && !isCatalogsError}
                  >
                    <div>
                      <FilterableSelect
                        isDisabled={!orgSelected || isCatalogsFetching || isCatalogsError}
                        isLoading={isCatalogsFetching}
                        options={catalogs ?? []}
                        value={catalogs?.find((c) => c.id === value) ?? null}
                        onChange={(opt) => {
                          const option = opt as SingleValue<NonNullable<typeof catalogs>[number]>;
                          onChange(option?.id ?? "");
                          setValue("provider.consumerOrgId", "");
                          setValue("provider.appId", "");
                        }}
                        placeholder="Select a catalog..."
                        getOptionLabel={(option) => option.title || option.name}
                        getOptionValue={(option) => option.id}
                      />
                    </div>
                  </Tooltip>
                </FormControl>
              )}
            />

            <Controller
              control={control}
              name="provider.appId"
              defaultValue=""
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  label={
                    <div className="flex items-center space-x-2">
                      <span>Application</span>
                      {getStatusIndicator(catalogSelected, isAppsFetching, isAppsError)}
                    </div>
                  }
                  isError={Boolean(error)}
                  errorText={error?.message}
                  isRequired
                >
                  <Tooltip
                    content={getAppTooltipContent()}
                    isDisabled={catalogSelected && !isAppsError}
                  >
                    <div>
                      <FilterableSelect
                        isDisabled={!catalogSelected || isAppsFetching || isAppsError}
                        isLoading={isAppsFetching}
                        options={apps ?? []}
                        value={apps?.find((a) => a.id === value) ?? null}
                        onChange={(opt) => {
                          const option = opt as SingleValue<NonNullable<typeof apps>[number]>;
                          onChange(option?.id ?? "");
                          setValue("provider.consumerOrgId", option?.consumerOrgId ?? "");
                        }}
                        placeholder="Select an application..."
                        getOptionLabel={(option) => option.title || option.name}
                        getOptionValue={(option) => option.id}
                      />
                    </div>
                  </Tooltip>
                </FormControl>
              )}
            />

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

        <div className="mt-4 flex items-center space-x-4">
          <Button type="submit" isLoading={isSubmitting}>
            Submit
          </Button>
          <Button variant="outline_bg" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};
