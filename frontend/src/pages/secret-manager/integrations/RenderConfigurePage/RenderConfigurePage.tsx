import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { faBugs } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";
import { z } from "zod";

import { PageTitle } from "@app/components/PageTitle";
import {
  Alert,
  AlertDescription,
  AlertTitle,
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
      className="flex h-full w-full flex-col items-center justify-center gap-6"
    >
      <PageTitle title="Set Up Render Integration" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <img src="/images/integrations/Render.png" height={30} width={30} alt="Render logo" />
            Render Integration
            <DocumentationLinkBadge href="https://infisical.com/docs/integrations/cloud/render" />
          </CardTitle>
          <CardDescription>
            Choose which environment or folder in Infisical you want to sync to Render environment
            variables.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Controller
            control={control}
            name="selectedSourceEnvironment"
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
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
              <Field data-invalid={Boolean(error)}>
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
                <Field data-invalid={Boolean(error)}>
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
        </CardContent>
        <CardFooter className="justify-end border-t pt-4">
          <Button
            type="submit"
            isPending={isLoading}
            isDisabled={integrationAuthApps.length === 0}
            variant="project"
          >
            Create Integration
          </Button>
        </CardFooter>
      </Card>
      <Alert variant="info" className="w-full max-w-lg">
        <InfoIcon />
        <AlertTitle>Pro Tip</AlertTitle>
        <AlertDescription>
          After creating an integration, your secrets will start syncing immediately. This might
          cause an unexpected override of current secrets in Render with secrets from Infisical.
        </AlertDescription>
      </Alert>
    </form>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <PageTitle title="Set Up Render Integration" />
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
