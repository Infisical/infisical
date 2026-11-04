import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { PageTitle } from "@app/components/PageTitle";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldLabel,
  Input,
  SecretPathInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toggle
} from "@app/components/v3";
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
      <PageTitle title="Set Up Azure App Configuration Integration" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <img
              src="/images/integrations/Microsoft Azure.png"
              height={35}
              width={35}
              alt="Azure logo"
            />
            <span>Azure App Configuration</span>
          </CardTitle>
          <CardDescription>
            Choose which environment in Infisical you want to sync to your Azure App Configuration.
          </CardDescription>
          <CardAction>
            <Badge variant="info" asChild>
              <a
                href="https://infisical.com/docs/integrations/cloud/azure-app-configuration"
                target="_blank"
                rel="noopener noreferrer"
              >
                <FontAwesomeIcon icon={faBookOpen} />
                Docs
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
              </a>
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div>
            <div className="">
              <Controller
                control={control}
                name="sourceEnvironment"
                render={({ field, fieldState: { error } }) => (
                  <Field className="mb-4" data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor="azureappconfiguration-sourceenvironment">
                      Project Environment
                    </FieldLabel>
                    <Select
                      value={field.value}
                      onValueChange={(val) => {
                        field.onChange(val);
                      }}
                    >
                      <SelectTrigger
                        className="w-full"
                        id="azureappconfiguration-sourceenvironment"
                        isError={Boolean(error)}
                        aria-describedby={
                          error ? "azureappconfiguration-sourceenvironment-error" : undefined
                        }
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {workspace?.environments.map((sourceEnvironment) => (
                          <SelectItem
                            value={sourceEnvironment.slug}
                            key={`source-environment-${sourceEnvironment.slug}`}
                          >
                            {sourceEnvironment.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {Boolean(error) && (
                      <FieldError id="azureappconfiguration-sourceenvironment-error">
                        {error?.message}
                      </FieldError>
                    )}
                  </Field>
                )}
              />

              <div className="mb-2 flex w-full flex-col gap-1">
                <Controller
                  control={control}
                  name="useLabels"
                  render={({ field: { onChange, value } }) => (
                    <Field orientation="horizontal">
                      <FieldLabel htmlFor="use-environment-labels">Use Labels</FieldLabel>
                      <Toggle
                        id="use-environment-labels"
                        onCheckedChange={(isChecked) => onChange(isChecked)}
                        checked={value}
                        variant="project"
                      />
                    </Field>
                  )}
                />

                {shouldUseLabels && (
                  <Controller
                    control={control}
                    name="azureLabel"
                    render={({ field, fieldState: { error } }) => (
                      <Field className="mb-4" data-invalid={Boolean(error)}>
                        <Input
                          {...field}
                          placeholder="pre-prod"
                          id="azureappconfiguration-azurelabel"
                          isError={Boolean(error)}
                          aria-describedby={
                            error ? "azureappconfiguration-azurelabel-error" : undefined
                          }
                        />
                        {Boolean(error) && (
                          <FieldError id="azureappconfiguration-azurelabel-error">
                            {error?.message}
                          </FieldError>
                        )}
                      </Field>
                    )}
                  />
                )}
              </div>
            </div>
            <Controller
              control={control}
              name="secretPath"
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4" data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="azureappconfiguration-secretpath">Secrets Path</FieldLabel>
                  <SecretPathInput
                    {...field}
                    environment={selectedEnvironment}
                    id="azureappconfiguration-secretpath"
                    isError={Boolean(error)}
                    aria-describedby={error ? "azureappconfiguration-secretpath-error" : undefined}
                  />
                  {Boolean(error) && (
                    <FieldError id="azureappconfiguration-secretpath-error">
                      {error?.message}
                    </FieldError>
                  )}
                </Field>
              )}
            />
            <Controller
              control={control}
              name="baseUrl"
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4" data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="azureappconfiguration-baseurl">
                    Azure App Configuration URL
                  </FieldLabel>
                  <Input
                    placeholder="https://infisical-configuration-integration-test.azconfig.io"
                    {...field}
                    id="azureappconfiguration-baseurl"
                    isError={Boolean(error)}
                    aria-describedby={error ? "azureappconfiguration-baseurl-error" : undefined}
                  />
                  {Boolean(error) && (
                    <FieldError id="azureappconfiguration-baseurl-error">
                      {error?.message}
                    </FieldError>
                  )}
                </Field>
              )}
            />
            <Controller
              control={control}
              name="secretPrefix"
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4" data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="azureappconfiguration-secretprefix">Key Prefix</FieldLabel>
                  <Input
                    {...field}
                    id="azureappconfiguration-secretprefix"
                    isError={Boolean(error)}
                    aria-describedby={
                      error ? "azureappconfiguration-secretprefix-error" : undefined
                    }
                  />
                  {Boolean(error) && (
                    <FieldError id="azureappconfiguration-secretprefix-error">
                      {error?.message}
                    </FieldError>
                  )}
                </Field>
              )}
            />
            <Controller
              control={control}
              name="initialSyncBehavior"
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <Field className="mb-4" data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="azureappconfiguration-initialsyncbehavior">
                    Initial Sync Behavior
                  </FieldLabel>
                  <Select defaultValue={field.value} onValueChange={(e) => onChange(e)}>
                    <SelectTrigger
                      className="w-full"
                      id="azureappconfiguration-initialsyncbehavior"
                      isError={Boolean(error)}
                      aria-describedby={
                        error ? "azureappconfiguration-initialsyncbehavior-error" : undefined
                      }
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {initialSyncBehaviors.map((b) => {
                        return (
                          <SelectItem value={b.value} key={`sync-behavior-${b.value}`}>
                            {b.label}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {Boolean(error) && (
                    <FieldError id="azureappconfiguration-initialsyncbehavior-error">
                      {error?.message}
                    </FieldError>
                  )}
                </Field>
              )}
            />
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" isPending={isSubmitting} variant="project">
            Create Integration
          </Button>
        </CardFooter>
      </Card>
    </form>
  ) : (
    <>
      <PageTitle title="Set Up Azure App Configuration Integration" />
      <div />
    </>
  );
};
