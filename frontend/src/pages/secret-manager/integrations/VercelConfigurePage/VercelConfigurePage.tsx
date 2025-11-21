import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import {
  faArrowUpRightFromSquare,
  faBookOpen,
  faBugs,
  faCircleInfo
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useSearch } from "@tanstack/react-router";

import {
  Button,
  Card,
  CardTitle,
  FormControl,
  Input,
  Select,
  SelectItem,
  Tooltip
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { useCreateIntegration } from "@app/hooks/api";
import {
  useGetIntegrationAuthApps,
  useGetIntegrationAuthById,
  useGetIntegrationAuthVercelBranches,
  useGetIntegrationAuthVercelCustomEnvironments
} from "@app/hooks/api/integrationAuth";
import { IntegrationSyncBehavior } from "@app/hooks/api/integrations/types";
import { IntegrationsListPageTabs } from "@app/types/integrations";

const vercelEnvironments = [
  { name: "Development", slug: "development" },
  { name: "Preview", slug: "preview" },
  { name: "Production", slug: "production" }
];

const initialSyncBehaviors = [
  {
    label: "No Import - Overwrite all values in Vercel",
    value: IntegrationSyncBehavior.OVERWRITE_TARGET
  },
  {
    label: "Import - Prefer values from Infisical",
    value: IntegrationSyncBehavior.PREFER_SOURCE
  }
];

export const VercelConfigurePage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useCreateIntegration();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState(
    currentProject.environments[0].slug
  );
  const [secretPath, setSecretPath] = useState("/");
  const [initialSyncBehavior, setInitialSyncBehavior] = useState<IntegrationSyncBehavior>(
    IntegrationSyncBehavior.PREFER_SOURCE
  );
  const [targetAppId, setTargetAppId] = useState("");
  const [targetEnvironment, setTargetEnvironment] = useState("");
  const [targetBranch, setTargetBranch] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.VercelConfigurePage.id,
    select: (el) => el.integrationAuthId
  });

  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");
  const { data: integrationAuthApps, isPending: isIntegrationAuthAppsLoading } =
    useGetIntegrationAuthApps({
      integrationAuthId: (integrationAuthId as string) ?? "",
      teamId: integrationAuth?.teamId as string
    });

  const { data: customEnvironments } = useGetIntegrationAuthVercelCustomEnvironments({
    teamId: integrationAuth?.teamId as string,
    integrationAuthId: integrationAuthId as string
  });

  const { data: branches } = useGetIntegrationAuthVercelBranches({
    integrationAuthId: integrationAuthId as string,
    appId: targetAppId
  });

  const filteredBranches = branches?.filter((branchName) => branchName !== "main").concat();

  useEffect(() => {
    if (integrationAuthApps) {
      if (integrationAuthApps.length > 0) {
        setTargetAppId(integrationAuthApps[0].appId as string);
        setTargetEnvironment(vercelEnvironments[0].slug);
      } else {
        setTargetAppId("none");
        setTargetEnvironment(vercelEnvironments[0].slug);
      }
    }
  }, [integrationAuthApps]);

  const handleButtonClick = async () => {
    try {
      if (!integrationAuth?.id) return;

      setIsLoading(true);

      const targetApp = integrationAuthApps?.find(
        (integrationAuthApp) => integrationAuthApp.appId === targetAppId
      );

      if (!targetApp || !targetApp.appId) return;

      const path =
        targetEnvironment === "preview" && targetBranch !== "" ? targetBranch : undefined;

      await mutateAsync({
        integrationAuthId: integrationAuth?.id,
        isActive: true,
        app: targetApp.name,
        appId: targetApp.appId,
        sourceEnvironment: selectedSourceEnvironment,
        targetEnvironment,
        path,
        secretPath,
        metadata: {
          initialSyncBehavior
        }
      });

      setIsLoading(false);
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

  const selectedVercelEnvironments = useMemo(() => {
    let selectedEnvironments = vercelEnvironments;

    const environments = customEnvironments?.find(
      (e) => e.appId === targetAppId
    )?.customEnvironments;

    if (environments && environments.length > 0) {
      selectedEnvironments = [
        ...selectedEnvironments,
        ...environments.map((env) => ({
          name: env.slug,
          slug: env.id
        }))
      ];
    }

    return selectedEnvironments;
  }, [targetAppId, customEnvironments]);

  return integrationAuth &&
    selectedSourceEnvironment &&
    integrationAuthApps &&
    targetAppId &&
    targetEnvironment ? (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <Helmet>
        <title>Set Up Vercel Integration</title>
      </Helmet>
      <Card className="max-w-lg rounded-md border border-mineshaft-600 p-0">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="Select which environment or folder in Infisical you want to sync to Vercel's environment variables."
        >
          <div className="flex flex-row items-center">
            <div className="flex items-center">
              <img src="/images/integrations/Vercel.png" height={30} width={30} alt="Vercel logo" />
            </div>
            <span className="ml-2">Vercel Integration </span>
            <a
              target="_blank"
              href="https://infisical.com/docs/integrations/cloud/vercel"
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
        <FormControl label="Infisical Project Environment" className="px-6">
          <Select
            value={selectedSourceEnvironment}
            onValueChange={(val) => setSelectedSourceEnvironment(val)}
            className="w-full border border-mineshaft-500"
          >
            {currentProject?.environments.map((sourceEnvironment) => (
              <SelectItem
                value={sourceEnvironment.slug}
                key={`azure-key-vault-environment-${sourceEnvironment.slug}`}
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
        <FormControl
          label="Vercel App"
          helperText={
            <Tooltip
              className="max-w-md"
              content="Double check Infisical's access permissions in Vercel by navigating to Team > Integrations > Infisical > Settings > Manage Access."
            >
              <div>
                <span>Don&#39;t see the project you&#39;re looking for?</span>{" "}
                <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
              </div>
            </Tooltip>
          }
          className="px-6"
        >
          <Select
            value={targetAppId}
            onValueChange={(val) => {
              if (vercelEnvironments.every((env) => env.slug !== targetEnvironment)) {
                setTargetEnvironment(vercelEnvironments[0].slug);
              }

              setTargetAppId(val);
            }}
            className="w-full border border-mineshaft-500"
            isDisabled={integrationAuthApps.length === 0}
          >
            {integrationAuthApps.length > 0 ? (
              integrationAuthApps.map((integrationAuthApp) => (
                <SelectItem
                  value={integrationAuthApp.appId as string}
                  key={`target-app-${integrationAuthApp.appId as string}`}
                >
                  {integrationAuthApp.name}
                </SelectItem>
              ))
            ) : (
              <SelectItem value="none" key="target-app-none">
                No projects found
              </SelectItem>
            )}
          </Select>
        </FormControl>
        <FormControl label="Vercel App Environment" className="px-6">
          <Select
            value={targetEnvironment}
            onValueChange={(val) => setTargetEnvironment(val)}
            className="w-full border border-mineshaft-500"
          >
            {selectedVercelEnvironments.map((vercelEnvironment) => (
              <SelectItem
                value={vercelEnvironment.slug}
                key={`target-environment-${vercelEnvironment.slug}`}
              >
                {vercelEnvironment.name}
              </SelectItem>
            ))}
          </Select>
        </FormControl>
        {targetEnvironment === "preview" && filteredBranches && (
          <FormControl label="Vercel Preview Branch (Optional)" className="px-6">
            <Select
              value={targetBranch}
              onValueChange={(val) => setTargetBranch(val)}
              className="w-full border border-mineshaft-500"
            >
              {filteredBranches.map((branchName) => (
                <SelectItem value={branchName} key={`target-branch-${branchName}`}>
                  {branchName}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}

        <FormControl label="Initial Sync Behavior" className="px-6">
          <Select
            value={initialSyncBehavior}
            onValueChange={(val) => setInitialSyncBehavior(val as IntegrationSyncBehavior)}
            className="w-full border border-mineshaft-500 text-sm"
          >
            {initialSyncBehaviors.map((syncBehavior) => (
              <SelectItem value={syncBehavior.value} key={`sync-behavior-${syncBehavior.value}`}>
                {syncBehavior.label}
              </SelectItem>
            ))}
          </Select>
        </FormControl>

        <Button
          onClick={handleButtonClick}
          color="mineshaft"
          variant="outline_bg"
          className="mt-2 mr-6 mb-6 ml-auto"
          isLoading={isLoading}
          isDisabled={integrationAuthApps.length === 0}
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
          After creating an integration, your secrets will start syncing immediately. This might
          cause an unexpected override of current secrets in Vercel with secrets from Infisical.
        </span>
      </div>
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <Helmet>
        <title>Set Up Vercel Integration</title>
      </Helmet>
      {isIntegrationAuthAppsLoading ? (
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
