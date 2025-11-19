import { Helmet } from "react-helmet";
import { Controller, useForm } from "react-hook-form";
import { faArrowUpRightFromSquare, faBookOpen, faBugs } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

import { Button, Card, CardTitle, FormControl, Select, SelectItem } from "@app/components/v2";
import { SecretPathInput } from "@app/components/v2/SecretPathInput";
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
      <Helmet>
        <title>Set Up {APP_NAME} Integration</title>
      </Helmet>
      <Card className="max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle={`Choose which environment or folder in Infisical you want to sync to ${APP_NAME} environment variables.`}
        >
          <div className="flex flex-row items-center">
            <div className="flex items-center pb-0.5">
              <img
                src="/images/integrations/Hasura.svg"
                height={30}
                width={30}
                alt={`${APP_NAME} logo`}
              />
            </div>
            <span className="ml-2.5">{APP_NAME} Integration </span>
            <a
              target="_blank"
              rel="noopener noreferrer"
              href="https://infisical.com/docs/integrations/cloud/hasura-cloud"
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

        <form onSubmit={handleSubmit(onFormSubmit)} className="flex w-full flex-col px-6">
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
                  value={field.value}
                  onValueChange={(val) => {
                    field.onChange(val);
                  }}
                >
                  {currentProject?.environments.map((sourceEnvironment) => (
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

          <Controller
            control={control}
            name="secretPath"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Secrets Path" errorText={error?.message} isError={Boolean(error)}>
                <SecretPathInput {...field} environment={selectedSourceEnvironment} />
              </FormControl>
            )}
          />

          <Controller
            control={control}
            name="appId"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Hasura Cloud Project"
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <Select
                  className="w-full border border-mineshaft-500"
                  value={field.value}
                  isDisabled={integrationAuthApps?.length === 0}
                  onValueChange={(val) => {
                    field.onChange(val);
                  }}
                >
                  {integrationAuthApps?.map((project) => (
                    <SelectItem value={project.appId ?? ""} key={`project-id-${project.appId}`}>
                      {project.name}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />

          <Button
            type="submit"
            color="mineshaft"
            variant="outline_bg"
            className="mt-2 mb-6 ml-auto"
            isLoading={isSubmitting}
          >
            Create Integration
          </Button>
        </form>
      </Card>
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <Helmet>
        <title>Set Up {APP_NAME} Integration</title>
      </Helmet>
      {isIntegrationAuthLoading || isIntegrationAuthAppsLoading ? (
        <img
          src="/images/loading/loading.gif"
          height={70}
          width={120}
          alt="infisical loading indicator"
        />
      ) : (
        <div className="flex h-max max-w-md flex-col rounded-md border border-mineshaft-600 bg-mineshaft-800 p-6 text-center text-mineshaft-200">
          <FontAwesomeIcon icon={faBugs} className="inlineli my-2 text-6xl" />
          <p>
            Something went wrong. Please contact{" "}
            <a
              className="inline cursor-pointer text-mineshaft-100 underline decoration-primary-500 underline-offset-4 opacity-80 duration-200 hover:opacity-100"
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
