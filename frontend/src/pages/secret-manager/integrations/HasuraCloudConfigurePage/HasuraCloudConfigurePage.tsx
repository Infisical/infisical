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
import { IntegrationsListPageTabs } from "@app/types/integrations";

const schema = z.object({
  secretPath: z.string().trim(),
  sourceEnvironment: z.string().trim(),
  appId: z.string().trim()
});

type FormData = z.infer<typeof schema>;

const APP_NAME = "Hasura Cloud";
export const HasuraCloudConfigurePage = () => {
  const {
    control,
    handleSubmit,
    watch,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });
  const navigate = useNavigate();
  const { mutateAsync } = useCreateIntegration();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.HasuraCloudConfigurePage.id,
    select: (el) => el.integrationAuthId
  });

  const { data: integrationAuth, isPending: isIntegrationAuthLoading } = useGetIntegrationAuthById(
    (integrationAuthId as string) ?? ""
  );

  const selectedSourceEnvironment = watch("sourceEnvironment");

  const { data: integrationAuthApps, isPending: isIntegrationAuthAppsLoading } =
    useGetIntegrationAuthApps({
      integrationAuthId: (integrationAuthId as string) ?? ""
    });

  const onFormSubmit = async ({ secretPath, sourceEnvironment, appId }: FormData) => {
    try {
      if (!integrationAuth?.id) return;

      const app = integrationAuthApps?.find((data) => data.appId === appId);
      await mutateAsync({
        integrationAuthId: integrationAuth?.id,
        isActive: true,
        sourceEnvironment,
        secretPath,
        appId,
        app: app?.name
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

  return integrationAuth && integrationAuthApps ? (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <PageTitle title={`Set Up ${APP_NAME} Integration`} />
      <form onSubmit={handleSubmit(onFormSubmit)} className="w-full max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>
              <img
                src="/images/integrations/Hasura.svg"
                height={30}
                width={30}
                alt={`${APP_NAME} logo`}
              />
              {APP_NAME} Integration
              <DocumentationLinkBadge href="https://infisical.com/docs/integrations/cloud/hasura-cloud" />
            </CardTitle>
            <CardDescription>{`Choose which environment or folder in Infisical you want to sync to ${APP_NAME} environment variables.`}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Controller
              control={control}
              name="sourceEnvironment"
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="HasuraCloudConfigurePage-field-1">
                    Project Environment
                  </FieldLabel>
                  <Select
                    value={field.value}
                    onValueChange={(val) => {
                      field.onChange(val);
                    }}
                  >
                    <SelectTrigger
                      id="HasuraCloudConfigurePage-field-1"
                      aria-describedby="HasuraCloudConfigurePage-field-1-feedback"
                      isError={Boolean(error)}
                      className="w-full"
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
                    <FieldError id="HasuraCloudConfigurePage-field-1-feedback">
                      {error?.message}
                    </FieldError>
                  )}
                </Field>
              )}
            />

            <Controller
              control={control}
              name="secretPath"
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="HasuraCloudConfigurePage-field-2">Secrets Path</FieldLabel>
                  <SecretPathInput
                    id="HasuraCloudConfigurePage-field-2"
                    aria-describedby="HasuraCloudConfigurePage-field-2-feedback"
                    isError={Boolean(error)}
                    {...field}
                    environment={selectedSourceEnvironment}
                  />
                  {Boolean(error) && (
                    <FieldError id="HasuraCloudConfigurePage-field-2-feedback">
                      {error?.message}
                    </FieldError>
                  )}
                </Field>
              )}
            />

            <Controller
              control={control}
              name="appId"
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="HasuraCloudConfigurePage-field-3">
                    Hasura Cloud Project
                  </FieldLabel>
                  <Select
                    value={field.value}
                    onValueChange={(val) => {
                      field.onChange(val);
                    }}
                    disabled={integrationAuthApps?.length === 0}
                  >
                    <SelectTrigger
                      id="HasuraCloudConfigurePage-field-3"
                      aria-describedby="HasuraCloudConfigurePage-field-3-feedback"
                      isError={Boolean(error)}
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {integrationAuthApps?.map((project) => (
                        <SelectItem value={project.appId ?? ""} key={`project-id-${project.appId}`}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {Boolean(error) && (
                    <FieldError id="HasuraCloudConfigurePage-field-3-feedback">
                      {error?.message}
                    </FieldError>
                  )}
                </Field>
              )}
            />
          </CardContent>
          <CardFooter className="justify-end border-t pt-4">
            <Button type="submit" isPending={isSubmitting} variant="project">
              Create Integration
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <PageTitle title={`Set Up ${APP_NAME} Integration`} />
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
