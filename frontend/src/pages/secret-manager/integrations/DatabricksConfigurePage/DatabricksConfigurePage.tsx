import { useState } from "react";
import { Helmet } from "react-helmet";
import {
  faArrowUpRightFromSquare,
  faBookOpen,
  faBugs,
  faCircleInfo
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Card,
  CardTitle,
  FormControl,
  Input,
  Select,
  SelectItem
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { useCreateIntegration } from "@app/hooks/api";
import {
  useGetIntegrationAuthApps,
  useGetIntegrationAuthById
} from "@app/hooks/api/integrationAuth";
import { IntegrationsListPageTabs } from "@app/types/integrations";

export const DatabricksConfigurePage = () => {
  const navigate = useNavigate();
  const { mutateAsync, isPending } = useCreateIntegration();

  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.DatabricksConfigurePage.id,
    select: (el) => el.integrationAuthId
  });

  const { data: integrationAuth, isPending: isintegrationAuthLoading } = useGetIntegrationAuthById(
    (integrationAuthId as string) ?? ""
  );

  const { data: integrationAuthScopes, isPending: isIntegrationAuthScopesLoading } =
    useGetIntegrationAuthApps({
      integrationAuthId: (integrationAuthId as string) ?? ""
    });

  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState(
    currentProject.environments[0].slug
  );
  const [targetScope, setTargetScope] = useState("");
  const [secretPath, setSecretPath] = useState("/");

  const handleButtonClick = async () => {
    if (!integrationAuth?.id) return;

    if (!targetScope) {
      createNotification({
        type: "error",
        text: "Please select a scope"
      });
      return;
    }

    const selectedScope = integrationAuthScopes?.find(
      (integrationAuthScope) => integrationAuthScope.name === targetScope
    );

    if (!selectedScope) {
      createNotification({
        type: "error",
        text: "Invalid scope selected"
      });
      return;
    }

    await mutateAsync({
      integrationAuthId: integrationAuth?.id,
      isActive: true,
      app: selectedScope.name, // scope name
      sourceEnvironment: selectedSourceEnvironment,
      secretPath
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
  };

  return integrationAuth && selectedSourceEnvironment && integrationAuthScopes ? (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <Helmet>
        <title>Set Up Databricks Integration</title>
      </Helmet>
      <Card className="max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="Choose which environment or folder in Infisical you want to sync to which Databricks secrets scope."
        >
          <div className="flex flex-row items-center">
            <div className="flex items-center pb-0.5">
              <img
                src="/images/integrations/Databricks.png"
                height={30}
                width={30}
                alt="Databricks logo"
              />
            </div>
            <span className="ml-1.5">Databricks Integration </span>
            <a
              href="https://infisical.com/docs/integrations/cloud/databricks"
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

        <FormControl label="Project Environment" className="px-6">
          <Select
            value={selectedSourceEnvironment}
            onValueChange={(val) => setSelectedSourceEnvironment(val)}
            className="w-full border border-mineshaft-500"
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
        <FormControl label="Secrets Path" className="px-6">
          <Input
            value={secretPath}
            onChange={(evt) => setSecretPath(evt.target.value)}
            placeholder="Provide a path, default is /"
          />
        </FormControl>

        {integrationAuthScopes && (
          <FormControl label="Databricks Scope" className="px-6">
            <Select
              value={targetScope}
              onValueChange={(val) => {
                setTargetScope(val);
              }}
              className="w-full border border-mineshaft-500"
              placeholder={
                integrationAuthScopes.length === 0 ? "No scopes found." : "Select scope..."
              }
              isDisabled={integrationAuthScopes.length === 0}
            >
              {integrationAuthScopes.length > 0 ? (
                integrationAuthScopes.map((scope) => (
                  <SelectItem value={scope.name!} key={`target-scope-${scope.name}`}>
                    {scope.name}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="none" key="target-app-none">
                  No scopes found
                </SelectItem>
              )}
            </Select>
          </FormControl>
        )}
        <Button
          onClick={handleButtonClick}
          colorSchema="primary"
          variant="outline_bg"
          className="mt-2 mr-6 mb-6 ml-auto w-min"
          isLoading={isPending}
          isDisabled={integrationAuthScopes.length === 0 || isPending}
        >
          Create Integration
        </Button>
      </Card>
      <div className="mt-6 w-full max-w-md border-t border-mineshaft-800" />
      <div className="mt-6 flex w-full max-w-lg flex-col rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4">
        <div className="flex flex-row items-center">
          <FontAwesomeIcon icon={faCircleInfo} className="text-xl text-mineshaft-200" />{" "}
          <span className="text-md ml-3 text-mineshaft-100">Pro Tip</span>
        </div>
        <span className="mt-4 text-sm text-mineshaft-300">
          When integrating with Databricks, Infisical is intended to be the source of truth for the
          secrets in the configured Databricks scope.
        </span>
        <span className="mt-4 text-sm text-mineshaft-300">
          Any secrets not present in Infisical will be removed from the specified scope. To prevent
          removal of secrets not managed by Infisical, Infisical recommends creating a designated
          secret scope for your integration.
        </span>
      </div>
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <Helmet>
        <title>Set Up Databricks Integration</title>
      </Helmet>
      {isIntegrationAuthScopesLoading || isintegrationAuthLoading ? (
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
