import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { faBugs } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

import { PageTitle } from "@app/components/PageTitle";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  Field,
  FieldError,
  FieldLabel,
  SecretPathInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { useCreateIntegration } from "@app/hooks/api";
import {
  useGetIntegrationAuthApps,
  useGetIntegrationAuthById
} from "@app/hooks/api/integrationAuth";
import { IntegrationSyncBehavior } from "@app/hooks/api/integrations/types";
import { IntegrationsListPageTabs } from "@app/types/integrations";

const initialSyncBehaviors = [
  {
    label: "No Import - Overwrite all values in Heroku",
    value: IntegrationSyncBehavior.OVERWRITE_TARGET
  },
  { label: "Import - Prefer values from Heroku", value: IntegrationSyncBehavior.PREFER_TARGET },
  { label: "Import - Prefer values from Infisical", value: IntegrationSyncBehavior.PREFER_SOURCE }
];

const schema = z.object({
  selectedSourceEnvironment: z.string(),
  secretPath: z.string(),
  targetApp: z.string(),
  initialSyncBehavior: z.nativeEnum(IntegrationSyncBehavior)
});

type FormData = z.infer<typeof schema>;

export const HerokuConfigurePage = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { control, handleSubmit, setValue, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      secretPath: "/",
      initialSyncBehavior: IntegrationSyncBehavior.PREFER_SOURCE,
      selectedSourceEnvironment: currentProject.environments[0].slug
    }
  });

  const selectedSourceEnvironment = watch("selectedSourceEnvironment");

  const { mutateAsync, isPending: isLoading } = useCreateIntegration();
  // const { mutateAsync: mutateAsyncEnv } = useCreateWsEnvironment();

  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.HerokuConfigurePage.id,
    select: (el) => el.integrationAuthId
  });

  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");
  const { data: integrationAuthApps, isPending: isIntegrationAuthAppsLoading } =
    useGetIntegrationAuthApps({
      integrationAuthId: (integrationAuthId as string) ?? ""
    });

  useEffect(() => {
    if (integrationAuthApps) {
      if (integrationAuthApps.length > 0) {
        setValue("targetApp", integrationAuthApps[0].name);
      } else {
        setValue("targetApp", "none");
      }
    }
  }, [integrationAuthApps]);

  const onFormSubmit = async ({ secretPath, targetApp, initialSyncBehavior }: FormData) => {
    try {
      if (!integrationAuth?.id) return;

      await mutateAsync({
        integrationAuthId: integrationAuth?.id,
        isActive: true,
        app: targetApp,
        sourceEnvironment: selectedSourceEnvironment,
        secretPath,
        metadata: {
          initialSyncBehavior
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

  return integrationAuth && selectedSourceEnvironment && integrationAuthApps ? (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <PageTitle title="Set Up Heroku Integration" />
      <form onSubmit={handleSubmit(onFormSubmit)} className="w-full max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>
              <img src="/images/integrations/Heroku.png" height={30} width={30} alt="Heroku logo" />
              Heroku Integration
              <DocumentationLinkBadge href="https://infisical.com/docs/integrations/cloud/heroku" />
            </CardTitle>
            <CardDescription>
              Select which environment or folder in Infisical you want to sync to Heroku&apos;s
              environment variables.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Controller
              control={control}
              name="selectedSourceEnvironment"
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="HerokuConfigurePage-field-1">Project Environment</FieldLabel>
                  <Select
                    defaultValue={field.value}
                    value={field.value}
                    name={field.name}
                    onValueChange={(e) => onChange(e)}
                  >
                    <SelectTrigger
                      id="HerokuConfigurePage-field-1"
                      aria-describedby="HerokuConfigurePage-field-1-feedback"
                      isError={Boolean(error)}
                      className="w-full"
                      ref={field.ref}
                      onBlur={field.onBlur}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currentProject?.environments.map((sourceEnvironment) => (
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
                    <FieldError id="HerokuConfigurePage-field-1-feedback">
                      {error?.message}
                    </FieldError>
                  )}
                </Field>
              )}
            />
            <Controller
              control={control}
              defaultValue=""
              name="secretPath"
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="HerokuConfigurePage-field-2">Secrets Path</FieldLabel>
                  <SecretPathInput
                    id="HerokuConfigurePage-field-2"
                    aria-describedby="HerokuConfigurePage-field-2-feedback"
                    isError={Boolean(error)}
                    {...field}
                    placeholder="/"
                    environment={selectedSourceEnvironment}
                  />
                  {Boolean(error) && (
                    <FieldError id="HerokuConfigurePage-field-2-feedback">
                      {error?.message}
                    </FieldError>
                  )}
                </Field>
              )}
            />
            <Controller
              control={control}
              name="targetApp"
              render={({ field: { onChange, ...field }, fieldState: { error } }) => {
                return (
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor="HerokuConfigurePage-field-3">Heroku App</FieldLabel>
                    <Select
                      value={field.value}
                      name={field.name}
                      onValueChange={(e) => {
                        if (e === "") return;
                        onChange(e);
                      }}
                    >
                      <SelectTrigger
                        id="HerokuConfigurePage-field-3"
                        aria-describedby="HerokuConfigurePage-field-3-feedback"
                        isError={Boolean(error)}
                        className="w-full"
                        ref={field.ref}
                        onBlur={field.onBlur}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {integrationAuthApps.length > 0 ? (
                          integrationAuthApps.map((integrationAuthApp) => (
                            <SelectItem
                              value={String(integrationAuthApp.name as string)}
                              key={`target-app-${String(integrationAuthApp.appId)}`}
                            >
                              {integrationAuthApp.name}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="none" key="target-app-none">
                            No apps found
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    {Boolean(error) && (
                      <FieldError id="HerokuConfigurePage-field-3-feedback">
                        {error?.message}
                      </FieldError>
                    )}
                  </Field>
                );
              }}
            />
            <Controller
              control={control}
              name="initialSyncBehavior"
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="HerokuConfigurePage-field-4">
                    Initial Sync Behavior
                  </FieldLabel>
                  <Select value={field.value} name={field.name} onValueChange={(e) => onChange(e)}>
                    <SelectTrigger
                      id="HerokuConfigurePage-field-4"
                      aria-describedby="HerokuConfigurePage-field-4-feedback"
                      isError={Boolean(error)}
                      className="w-full"
                      ref={field.ref}
                      onBlur={field.onBlur}
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
                    <FieldError id="HerokuConfigurePage-field-4-feedback">
                      {error?.message}
                    </FieldError>
                  )}
                </Field>
              )}
            />
          </CardContent>
          <CardFooter className="justify-end border-t pt-4">
            <Button
              size="sm"
              type="submit"
              isPending={isLoading}
              isDisabled={integrationAuthApps.length === 0}
              variant="project"
            >
              Create Integration
            </Button>
          </CardFooter>
        </Card>
      </form>
      {/* {integrationType === "App" && <>
      <div className="mt-6 w-full max-w-md border-t border-border-faint" />
      <div className="mt-6 flex w-full max-w-lg flex-col rounded-md border border-border-control bg-surface-raised p-4">
        <div className="flex flex-row items-center">
          <FontAwesomeIcon icon={faCircleInfo} className="text-xl text-foreground-secondary" />{" "}
          <span className="text-md ml-3 text-foreground">Pro Tip</span>
        </div>
        <span className="mt-4 text-sm text-label">
          After creating an integration, your secrets will start syncing immediately. This might
          cause an unexpected override of current secrets in Heroku with secrets from Infisical.
        </span>
      </div></>} */}
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <PageTitle title="Set Up Heroku Integration" />
      {isIntegrationAuthAppsLoading ? (
        <img
          src="/images/loading/loading.gif"
          height={70}
          width={120}
          alt="infisical loading indicator"
        />
      ) : (
        <div className="flex h-max max-w-md flex-col rounded-md border border-border-control bg-surface-raised p-6 text-center text-foreground-secondary">
          <FontAwesomeIcon icon={faBugs} className="inlineli my-2 text-6xl" />
          <p>
            Something went wrong. Please contact{" "}
            <a
              className="inline cursor-pointer text-foreground underline decoration-project underline-offset-4 opacity-80 duration-200 hover:opacity-100"
              target="_blank"
              rel="noopener noreferrer"
              href="mailto:support@infisical.com"
            >
              support@infisical.com
            </a>{" "}
            if the issue persists.
          </p>
        </div>
      )}
    </div>
  );
};
