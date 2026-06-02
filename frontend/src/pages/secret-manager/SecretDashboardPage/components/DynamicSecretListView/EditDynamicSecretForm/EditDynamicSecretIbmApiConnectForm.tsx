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
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, FilterableSelect, FormControl, Input, SecretInput } from "@app/components/v2";
import { Tooltip } from "@app/components/v2/Tooltip";
import { GatewayPicker } from "@app/components/v3/platform/GatewayPicker";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { useUpdateDynamicSecret } from "@app/hooks/api";
import {
  useGetIbmApiConnectOrgApps,
  useGetIbmApiConnectOrgCatalogs,
  useGetIbmApiConnectOrgs
} from "@app/hooks/api/dynamicSecret/queries";
import { TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";

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
    inputs: z.object({
      clientId: z.string().trim().min(1, "Client ID is required"),
      clientSecret: z.string().trim().min(1, "Client Secret is required"),
      instanceUrl: z.string().url("Must be a valid URL").trim().min(1, "Instance URL is required"),
      apiKey: z.string().trim().min(1, "API Key is required"),
      orgId: z.string().trim().min(1, "Organization is required"),
      catalogId: z.string().trim().min(1, "Catalog is required"),
      consumerOrgId: z.string().trim().min(1, "Consumer Organization is required"),
      appId: z.string().trim().min(1, "Application is required"),
      gatewayId: z.string().optional().nullable(),
      gatewayPoolId: z.string().optional().nullable()
    }),
    defaultTTL: z.string().superRefine(validateTTL),
    maxTTL: z
      .string()
      .optional()
      .superRefine((val, ctx) => {
        if (val) validateTTL(val, ctx);
      }),
    newName: z.string().refine((val) => val.toLowerCase() === val, "Must be lowercase")
  })
  .refine((d) => !d.maxTTL || ms(d.maxTTL)! >= ms(d.defaultTTL)!, {
    path: ["maxTTL"],
    message: "Max TTL must be greater than or equal to Default TTL"
  });
type TForm = z.infer<typeof formSchema>;

type Props = {
  onClose: () => void;
  dynamicSecret: TDynamicSecret & { inputs: unknown };
  secretPath: string;
  environment: string;
  projectSlug: string;
};

export const EditDynamicSecretIbmApiConnectForm = ({
  onClose,
  dynamicSecret,
  secretPath,
  environment,
  projectSlug
}: Props) => {
  const {
    control,
    formState: { isSubmitting },
    watch,
    setValue,
    handleSubmit
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    values: {
      defaultTTL: dynamicSecret.defaultTTL,
      maxTTL: dynamicSecret.maxTTL,
      newName: dynamicSecret.name,
      inputs: {
        ...(dynamicSecret.inputs as TForm["inputs"])
      }
    }
  });

  const instanceUrl = watch("inputs.instanceUrl");
  const apiKey = watch("inputs.apiKey");
  const clientId = watch("inputs.clientId");
  const clientSecret = watch("inputs.clientSecret");
  const orgId = watch("inputs.orgId");
  const catalogId = watch("inputs.catalogId");

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

  const updateDynamicSecret = useUpdateDynamicSecret();

  const handleUpdateDynamicSecret = async ({ inputs, maxTTL, defaultTTL, newName }: TForm) => {
    if (updateDynamicSecret.isPending) return;
    await updateDynamicSecret.mutateAsync({
      name: dynamicSecret.name,
      path: secretPath,
      projectSlug,
      environmentSlug: environment,
      data: {
        maxTTL: maxTTL || undefined,
        defaultTTL,
        inputs,
        newName: newName === dynamicSecret.name ? undefined : newName
      }
    });
    onClose();
    createNotification({
      type: "success",
      text: "Successfully updated dynamic secret"
    });
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
      <form onSubmit={handleSubmit(handleUpdateDynamicSecret)} autoComplete="off">
        <div>
          <div className="flex items-center space-x-2">
            <div className="grow">
              <Controller
                control={control}
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
                          gatewayId: watch("inputs.gatewayId") ?? null,
                          gatewayPoolId: watch("inputs.gatewayPoolId") ?? null
                        }}
                        onChange={({ gatewayId: newGwId, gatewayPoolId: newPoolId }) => {
                          setValue("inputs.gatewayId", newGwId ?? undefined, {
                            shouldDirty: true
                          });
                          setValue("inputs.gatewayPoolId", newPoolId ?? undefined, {
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
                name="inputs.instanceUrl"
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
                name="inputs.apiKey"
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
                name="inputs.clientId"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Client ID"
                    className="grow"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    isRequired
                  >
                    <Input {...field} />
                  </FormControl>
                )}
              />

              <Controller
                control={control}
                name="inputs.clientSecret"
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
              name="inputs.orgId"
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
                          setValue("inputs.catalogId", "");
                          setValue("inputs.consumerOrgId", "");
                          setValue("inputs.appId", "");
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
              name="inputs.catalogId"
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
                          setValue("inputs.consumerOrgId", "");
                          setValue("inputs.appId", "");
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
              name="inputs.appId"
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
                          setValue("inputs.consumerOrgId", option?.consumerOrgId ?? "");
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
