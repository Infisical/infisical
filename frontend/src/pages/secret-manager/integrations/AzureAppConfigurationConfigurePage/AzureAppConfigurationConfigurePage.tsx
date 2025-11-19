import { useEffect } from "react";
import { Helmet } from "react-helmet";
import { Controller, useForm } from "react-hook-form";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Card,
  CardTitle,
  FormControl,
  FormLabel,
  Input,
  Select,
  SelectItem,
  Switch
} from "@app/components/v2";
import { SecretPathInput } from "@app/components/v2/SecretPathInput";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { useCreateIntegration } from "@app/hooks/api";
import { useGetIntegrationAuthById } from "@app/hooks/api/integrationAuth";
import { IntegrationSyncBehavior } from "@app/hooks/api/integrations/types";
import { useGetWorkspaceById } from "@app/hooks/api/projects";
import { IntegrationsListPageTabs } from "@app/types/integrations";

const schema = z.object({
  baseUrl: z
    .string()
    .trim()
    .min(1, { message: "Azure App Configuration URL is required" })
    .url()
    .refine(
      (val) => val.endsWith(".azconfig.io"),
      "URL should have the following format: https://resource-name-here.azconfig.io"
    ),
  secretPath: z.string().trim().min(1, { message: "Secret path is required" }),
  sourceEnvironment: z.string().trim().min(1, { message: "Source environment is required" }),
  initialSyncBehavior: z.nativeEnum(IntegrationSyncBehavior),
  secretPrefix: z.string().default(""),
  useLabels: z.boolean().default(false),
  azureLabel: z.string().min(1).optional()
});

type TFormSchema = z.infer<typeof schema>;

const initialSyncBehaviors = [
  {
    label: "No Import - Overwrite all values in Azure App Configuration",
    value: IntegrationSyncBehavior.OVERWRITE_TARGET
  },
  {
    label: "Import - Prefer values from Azure App Configuration",
    value: IntegrationSyncBehavior.PREFER_TARGET
  },
  { label: "Import - Prefer values from Infisical", value: IntegrationSyncBehavior.PREFER_SOURCE }
];

export const AzureAppConfigurationConfigurePage = () => {
  const navigate = useNavigate();
  const {
    control,
    watch,
    setValue,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<TFormSchema>({
    resolver: zodResolver(schema),
    defaultValues: {
      secretPath: "/",
      secretPrefix: "",
      initialSyncBehavior: IntegrationSyncBehavior.PREFER_SOURCE
    }
  });

  const selectedEnvironment = watch("sourceEnvironment");
  const { mutateAsync } = useCreateIntegration();
  const { currentOrg } = useOrganization();
  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.AzureAppConfigurationsConfigurePage.id,
    select: (el) => el.integrationAuthId
  });
  const { currentProject } = useProject();

  const { data: workspace } = useGetWorkspaceById(currentProject.id);
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");

  useEffect(() => {
    if (workspace) {
      setValue("sourceEnvironment", workspace.environments[0].slug);
    }
  }, [workspace]);

  const shouldUseLabels = watch("useLabels");

  const handleIntegrationSubmit = async ({
    secretPath,
    useLabels,
    sourceEnvironment,
    baseUrl,
    initialSyncBehavior,
    secretPrefix,
    azureLabel
  }: TFormSchema) => {
    try {
      if (!integrationAuth?.id) return;

      if (useLabels && !azureLabel) {
        createNotification({
          type: "error",
          text: "Label must be provided when 'Use Labels' is enabled"
        });
        return;
      }

      await mutateAsync({
        integrationAuthId: integrationAuth?.id,
        isActive: true,
        app: baseUrl,
        sourceEnvironment,
        secretPath,
        metadata: {
          initialSyncBehavior,
          secretPrefix,
          ...(useLabels && { azureLabel })
        }
      });

      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations",
        params: {
          orgId: currentOrg.id,
          projectId: currentProject.id
        },
        search: {
          selectedTab: IntegrationsListPageTabs.NativeIntegrations
        }
      });
    } catch (err) {
      console.error(err);
    }
  };

  return integrationAuth && workspace ? (
    <form
      onSubmit={handleSubmit(handleIntegrationSubmit)}
      className="flex h-full w-full flex-col items-center justify-center"
    >
      <Helmet>
        <title>Set Up Azure App Configuration Integration</title>
      </Helmet>
      <Card className="max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="text-left text-xl"
          subTitle="Choose which environment in Infisical you want to sync to your Azure App Configuration."
        >
          <div className="flex flex-row items-center">
            <div className="flex items-center">
              <img
                src="/images/integrations/Microsoft Azure.png"
                height={35}
                width={35}
                alt="Azure logo"
              />
            </div>
            <span className="ml-1.5">Azure App Configuration</span>
            <a
              href="https://infisical.com/docs/integrations/cloud/azure-app-configuration"
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="mb-1 ml-2 inline-block cursor-default rounded-md bg-yellow/20 px-1.5 pt-[0.04rem] pb-[0.03rem] text-sm text-yellow opacity-80 hover:opacity-100">
                <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                Docs
                <FontAwesomeIcon
                  icon={faArrowUpRightFromSquare}
                  className="text-xxs mb-[0.07rem] ml-1.5"
                />
              </div>
            </a>
          </div>
        </CardTitle>
        <div className="px-6">
          <div className="">
            <Controller
              control={control}
              name="sourceEnvironment"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Project Environment"
                  errorText={error?.message}
                  isError={Boolean(error)}
                >
                  <Select
                    className="w-full border border-mineshaft-500"
                    dropdownContainerClassName="max-w-full"
                    value={field.value}
                    onValueChange={(val) => {
                      field.onChange(val);
                    }}
                  >
                    {workspace?.environments.map((sourceEnvironment) => (
                      <SelectItem
                        value={sourceEnvironment.slug}
                        key={`source-environment-${sourceEnvironment.slug}`}
                      >
                        {sourceEnvironment.name}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />

            <div className="mb-2 flex w-full flex-col gap-1">
              <Controller
                control={control}
                name="useLabels"
                render={({ field: { onChange, value } }) => (
                  <Switch
                    id="use-environment-labels"
                    onCheckedChange={(isChecked) => onChange(isChecked)}
                    isChecked={value}
                  >
                    <FormLabel label="Use Labels" />
                  </Switch>
                )}
              />

              {shouldUseLabels && (
                <Controller
                  control={control}
                  name="azureLabel"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      className=""
                      // label="Label"
                      errorText={error?.message}
                      isError={Boolean(error)}
                    >
                      <Input {...field} placeholder="pre-prod" />
                    </FormControl>
                  )}
                />
              )}
            </div>
          </div>
          <Controller
            control={control}
            name="secretPath"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Secrets Path" errorText={error?.message} isError={Boolean(error)}>
                <SecretPathInput {...field} environment={selectedEnvironment} />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="baseUrl"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Azure App Configuration URL"
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <Input
                  placeholder="https://infisical-configuration-integration-test.azconfig.io"
                  {...field}
                />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="secretPrefix"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Key Prefix" errorText={error?.message} isError={Boolean(error)}>
                <Input {...field} />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="initialSyncBehavior"
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl
                label="Initial Sync Behavior"
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <Select
                  defaultValue={field.value}
                  onValueChange={(e) => onChange(e)}
                  className="w-full border border-mineshaft-500"
                  dropdownContainerClassName="max-w-full"
                >
                  {initialSyncBehaviors.map((b) => {
                    return (
                      <SelectItem
                        value={b.value}
                        key={`sync-behavior-${b.value}`}
                        className="w-full"
                      >
                        {b.label}
                      </SelectItem>
                    );
                  })}
                </Select>
              </FormControl>
            )}
          />
          <Button
            type="submit"
            color="mineshaft"
            variant="outline_bg"
            className="mt-4 mb-6 ml-auto"
            isLoading={isSubmitting}
          >
            Create Integration
          </Button>
        </div>
      </Card>
    </form>
  ) : (
    <div />
  );
};
