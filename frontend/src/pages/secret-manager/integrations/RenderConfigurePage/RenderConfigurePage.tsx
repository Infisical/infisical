import { useEffect } from "react";
import { Helmet } from "react-helmet";
import { Controller, useForm } from "react-hook-form";
import {
  faArrowUpRightFromSquare,
  faBookOpen,
  faBugs,
  faCircleInfo
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldLabel,
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
import {
  useGetIntegrationAuthApps,
  useGetIntegrationAuthById
} from "@app/hooks/api/integrationAuth";
import { IntegrationsListPageTabs } from "@app/types/integrations";

const schema = z.object({
  selectedSourceEnvironment: z.string(),
  secretPath: z.string(),
  targetAppId: z.string(),
  shouldAutoRedeploy: z.boolean().default(false)
});

type FormData = z.infer<typeof schema>;

export const RenderConfigurePage = () => {
  const navigate = useNavigate();
  const { mutateAsync, isPending: isLoading } = useCreateIntegration();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { control, handleSubmit, setValue, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      secretPath: "/",
      shouldAutoRedeploy: false,
      selectedSourceEnvironment: currentProject.environments[0].slug
    }
  });

  const selectedSourceEnvironment = watch("selectedSourceEnvironment");

  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.RenderConfigurePage.id,
    select: (el) => el.integrationAuthId
  });

  const { data: integrationAuth, isPending: isIntegrationAuthLoading } = useGetIntegrationAuthById(
    (integrationAuthId as string) ?? ""
  );
  const { data: integrationAuthApps, isPending: isIntegrationAuthAppsLoading } =
    useGetIntegrationAuthApps({
      integrationAuthId: (integrationAuthId as string) ?? ""
    });

  useEffect(() => {
    if (integrationAuthApps) {
      if (integrationAuthApps.length > 0) {
        setValue("targetAppId", integrationAuthApps[0].appId as string);
      } else {
        setValue("targetAppId", "none");
      }
    }
  }, [integrationAuthApps]);

  const onFormSubmit = async ({ secretPath, targetAppId, shouldAutoRedeploy }: FormData) => {
    try {
      if (!integrationAuth?.id) return;

      await mutateAsync({
        integrationAuthId: integrationAuth?.id,
        isActive: true,
        app: integrationAuthApps?.find(
          (integrationAuthApp) => integrationAuthApp.appId === targetAppId
        )?.name,
        appId: targetAppId,
        sourceEnvironment: selectedSourceEnvironment,
        secretPath,
        metadata: {
          shouldAutoRedeploy
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
    <form
      onSubmit={handleSubmit(onFormSubmit)}
      className="flex h-full w-full flex-col items-center justify-center"
    >
      <Helmet>
        <title>Set Up Render Integration</title>
      </Helmet>
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <div className="flex flex-row items-center">
              <div className="flex items-center pb-0.5">
                <img
                  src="/images/integrations/Render.png"
                  height={30}
                  width={30}
                  alt="Render logo"
                />
              </div>
              <span className="ml-2.5">Render Integration </span>
              <a
                href="https://infisical.com/docs/integrations/cloud/render"
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="mb-1 ml-2 inline-block cursor-default rounded-md bg-warning/20 px-1.5 pt-[0.04rem] pb-[0.03rem] text-sm text-warning opacity-80 hover:opacity-100">
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
          <CardDescription>
            Choose which environment or folder in Infisical you want to sync to Render environment
            variables.
          </CardDescription>
        </CardHeader>
        <div className="px-6">
          <Controller
            control={control}
            name="selectedSourceEnvironment"
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <Field className="mb-4" data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="RenderConfigurePage-field-1">Project Environment</FieldLabel>
                <Select
                  defaultValue={field.value}
                  value={field.value}
                  name={field.name}
                  onValueChange={(e) => onChange(e)}
                >
                  <SelectTrigger
                    id="RenderConfigurePage-field-1"
                    aria-describedby="RenderConfigurePage-field-1-feedback"
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
                  <FieldError id="RenderConfigurePage-field-1-feedback">
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
              <Field className="mb-4" data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="RenderConfigurePage-field-2">Secrets Path</FieldLabel>
                <SecretPathInput
                  id="RenderConfigurePage-field-2"
                  aria-describedby="RenderConfigurePage-field-2-feedback"
                  isError={Boolean(error)}
                  {...field}
                  placeholder="/"
                  environment={selectedSourceEnvironment}
                />
                {Boolean(error) && (
                  <FieldError id="RenderConfigurePage-field-2-feedback">
                    {error?.message}
                  </FieldError>
                )}
              </Field>
            )}
          />
          <Controller
            control={control}
            name="targetAppId"
            render={({ field: { onChange, ...field }, fieldState: { error } }) => {
              return (
                <Field className="mb-4" data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="RenderConfigurePage-field-3">Render Service</FieldLabel>
                  <Select
                    value={field.value}
                    name={field.name}
                    onValueChange={(e) => {
                      if (e === "") return;
                      onChange(e);
                    }}
                  >
                    <SelectTrigger
                      id="RenderConfigurePage-field-3"
                      aria-describedby="RenderConfigurePage-field-3-feedback"
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
                            value={String(integrationAuthApp.appId as string)}
                            key={`target-app-${String(integrationAuthApp.appId)}`}
                          >
                            {integrationAuthApp.name}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="none" key="target-app-none">
                          No services found
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {Boolean(error) && (
                    <FieldError id="RenderConfigurePage-field-3-feedback">
                      {error?.message}
                    </FieldError>
                  )}
                </Field>
              );
            }}
          />
          <div className="mt-8 mb-[2.36rem] ml-1">
            <Controller
              control={control}
              name="shouldAutoRedeploy"
              render={({ field: { onChange, value } }) => (
                <Field orientation="horizontal">
                  <FieldLabel htmlFor="redeploy-render">
                    Auto-redeploy service upon secret change
                  </FieldLabel>
                  <Toggle
                    id="redeploy-render"
                    onCheckedChange={(isChecked) => onChange(isChecked)}
                    checked={value}
                  />
                </Field>
              )}
            />
          </div>
        </div>
        <Button
          className="mt-4 mr-6 mb-8 ml-auto w-min"
          size="sm"
          type="submit"
          isPending={isLoading}
          isDisabled={integrationAuthApps.length === 0}
          variant="project"
        >
          Create Integration
        </Button>
      </Card>
      <div className="mt-6 w-full max-w-md border-t border-border-faint" />
      <div className="mt-6 flex w-full max-w-lg flex-col rounded-md border border-border-control bg-surface-raised p-4">
        <div className="flex flex-row items-center">
          <FontAwesomeIcon icon={faCircleInfo} className="text-xl text-foreground-secondary" />{" "}
          <span className="text-md ml-3 text-foreground">Pro Tip</span>
        </div>
        <span className="mt-4 text-sm text-label">
          After creating an integration, your secrets will start syncing immediately. This might
          cause an unexpected override of current secrets in Render with secrets from Infisical.
        </span>
      </div>
    </form>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <Helmet>
        <title>Set Up Render Integration</title>
      </Helmet>
      {isIntegrationAuthLoading || isIntegrationAuthAppsLoading ? (
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
