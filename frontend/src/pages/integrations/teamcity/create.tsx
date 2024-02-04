import { useEffect, useState } from "react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { faArrowUpRightFromSquare, faBookOpen, faBugs } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import queryString from "query-string";

import { useCreateIntegration } from "@app/hooks/api";

import {
  Button,
  Card,
  CardTitle,
  FormControl,
  Input,
  Select,
  SelectItem
} from "../../../components/v2";
import {
  useGetIntegrationAuthApps,
  useGetIntegrationAuthById,
  useGetIntegrationAuthTeamCityBuildConfigs
} from "../../../hooks/api/integrationAuth";
import { useGetWorkspaceById } from "../../../hooks/api/workspace";

export default function TeamCityCreateIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useCreateIntegration();

  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState("");
  const [targetAppId, setTargetAppId] = useState("");
  const [targetBuildConfigId, setTargetBuildConfigId] = useState<string>("");
  const [secretPath, setSecretPath] = useState("/");
  const [isLoading, setIsLoading] = useState(false);

  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);

  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: integrationAuth, isLoading: isIntegrationAuthLoading } = useGetIntegrationAuthById(
    (integrationAuthId as string) ?? ""
  );
  const { data: integrationAuthApps, isLoading: isIntegrationAuthAppsLoading } =
    useGetIntegrationAuthApps({
      integrationAuthId: (integrationAuthId as string) ?? ""
    });

  const { data: targetBuildConfigs } = useGetIntegrationAuthTeamCityBuildConfigs({
    integrationAuthId: (integrationAuthId as string) ?? "",
    appId: targetAppId
  });

  useEffect(() => {
    if (workspace) {
      setSelectedSourceEnvironment(workspace.environments[0].slug);
    }
  }, [workspace]);

  useEffect(() => {
    if (integrationAuthApps) {
      if (integrationAuthApps.length > 0) {
        setTargetAppId(integrationAuthApps[0].appId as string);
      } else {
        setTargetAppId("none");
      }
    }
  }, [integrationAuthApps]);

  const handleButtonClick = async () => {
    try {
      if (!integrationAuth?.id) return;

      setIsLoading(true);

      const targetEnvironment = targetBuildConfigs?.find(
        (buildConfig) => buildConfig.buildConfigId === targetBuildConfigId
      );

      await mutateAsync({
        integrationAuthId: integrationAuth?.id,
        isActive: true,
        app: integrationAuthApps?.find(
          (integrationAuthApp) => integrationAuthApp.appId === targetAppId
        )?.name,
        appId: targetAppId,
        sourceEnvironment: selectedSourceEnvironment,
        targetEnvironment: targetEnvironment?.name,
        targetEnvironmentId: targetEnvironment?.buildConfigId,
        secretPath
      });

      setIsLoading(false);

      router.push(`/integrations/${localStorage.getItem("projectData.id")}`);
    } catch (err) {
      console.error(err);
    }
  };

  const filteredBuildConfigs = targetBuildConfigs?.concat({
    name: "",
    buildConfigId: ""
  });

  return integrationAuth &&
    workspace &&
    selectedSourceEnvironment &&
    integrationAuthApps &&
    filteredBuildConfigs &&
    targetAppId ? (
    <div className="flex h-full w-full items-center justify-center">
      <Head>
        <title>Set Up TeamCity Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <Card className="mb-12 max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="Choose which environment or folders in Infisical you want to sync to which project in TeamCity."
        >
          <div className="flex flex-row items-center">
            <div className="inline flex items-center pb-0.5">
              <Image
                src="/images/integrations/TeamCity.png"
                height={28}
                width={28}
                alt="TeamCity logo"
              />
            </div>
            <span className="ml-2">TeamCity Integration</span>
            <Link href="https://infisical.com/docs/integrations/cloud/teamcity" passHref>
              <a target="_blank" rel="noopener noreferrer">
                <div className="ml-2 mb-1 inline-block cursor-default rounded-md bg-yellow/20 px-1.5 pb-[0.03rem] pt-[0.04rem] text-sm text-yellow opacity-80 hover:opacity-100">
                  <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                  Docs
                  <FontAwesomeIcon
                    icon={faArrowUpRightFromSquare}
                    className="ml-1.5 mb-[0.07rem] text-xxs"
                  />
                </div>
              </a>
            </Link>
          </div>
        </CardTitle>
        <FormControl label="Project Environment" className="px-6">
          <Select
            value={selectedSourceEnvironment}
            onValueChange={(val) => setSelectedSourceEnvironment(val)}
            className="w-full border border-mineshaft-500"
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
        <FormControl label="Secrets Path" className="px-6">
          <Input
            value={secretPath}
            onChange={(evt) => setSecretPath(evt.target.value)}
            placeholder="Provide a path, default is /"
          />
        </FormControl>
        <FormControl label="TeamCity Project" className="px-6">
          <Select
            value={targetAppId}
            onValueChange={(val) => setTargetAppId(val)}
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
                No project found
              </SelectItem>
            )}
          </Select>
        </FormControl>
        <FormControl label="Team City Build Config (Optional)" className="px-6">
          <Select
            value={targetBuildConfigId}
            onValueChange={(val) => setTargetBuildConfigId(val)}
            className="w-full border border-mineshaft-500"
          >
            {filteredBuildConfigs.map((buildConfig: any) => (
              <SelectItem
                value={buildConfig.buildConfigId}
                key={`target-build-config-${buildConfig.buildConfigId}`}
              >
                {buildConfig.name}
              </SelectItem>
            ))}
          </Select>
        </FormControl>
        <Button
          onClick={handleButtonClick}
          color="mineshaft"
          variant="outline_bg"
          className="mb-6 mt-2 ml-auto mr-6"
          isLoading={isLoading}
          isDisabled={integrationAuthApps.length === 0}
        >
          Create Integration
        </Button>
      </Card>
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <Head>
        <title>Set Up TeamCity Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
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
}

TeamCityCreateIntegrationPage.requireAuth = true;
