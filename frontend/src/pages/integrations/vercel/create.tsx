import { useEffect, useState } from "react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  faArrowUpRightFromSquare,
  faBookOpen,
  faBugs,
  faCircleInfo
} from "@fortawesome/free-solid-svg-icons";
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
  useGetIntegrationAuthVercelBranches
} from "../../../hooks/api/integrationAuth";
import { useGetWorkspaceById } from "../../../hooks/api/workspace";

const vercelEnvironments = [
  { name: "Development", slug: "development" },
  { name: "Preview", slug: "preview" },
  { name: "Production", slug: "production" }
];

export default function VercelCreateIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useCreateIntegration();

  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState("");
  const [secretPath, setSecretPath] = useState("/");
  const [targetAppId, setTargetAppId] = useState("");
  const [targetEnvironment, setTargetEnvironment] = useState("");
  const [targetBranch, setTargetBranch] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);
  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");
  const { data: integrationAuthApps, isLoading: isIntegrationAuthAppsLoading } =
    useGetIntegrationAuthApps({
      integrationAuthId: (integrationAuthId as string) ?? "",
      teamId: integrationAuth?.teamId as string
    });

  const { data: branches } = useGetIntegrationAuthVercelBranches({
    integrationAuthId: integrationAuthId as string,
    appId: targetAppId
  });

  const filteredBranches = branches?.filter((branchName) => branchName !== "main").concat();

  useEffect(() => {
    if (workspace) {
      setSelectedSourceEnvironment(workspace.environments[0].slug);
    }
  }, [workspace]);

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
        secretPath
      });

      setIsLoading(false);
      router.push(`/integrations/${localStorage.getItem("projectData.id")}`);
    } catch (err) {
      console.error(err);
    }
  };

  return integrationAuth &&
    workspace &&
    selectedSourceEnvironment &&
    integrationAuthApps &&
    targetAppId &&
    targetEnvironment ? (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <Head>
        <title>Set Up Vercel Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <Card className="max-w-lg rounded-md border border-mineshaft-600 p-0">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="Select which environment or folder in Infisical you want to sync to Vercel's environment variables."
        >
          <div className="flex flex-row items-center">
            <div className="flex items-center">
              <Image
                src="/images/integrations/Vercel.png"
                height={30}
                width={30}
                alt="Vercel logo"
              />
            </div>
            <span className="ml-2">Vercel Integration </span>
            <Link href="https://infisical.com/docs/integrations/cloud/vercel" passHref>
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
        <FormControl label="Infisical Project Environment" className="px-6">
          <Select
            value={selectedSourceEnvironment}
            onValueChange={(val) => setSelectedSourceEnvironment(val)}
            className="w-full border border-mineshaft-500"
          >
            {workspace?.environments.map((sourceEnvironment) => (
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
        <FormControl label="Vercel App" className="px-6">
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
            {vercelEnvironments.map((vercelEnvironment) => (
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
        <Button
          onClick={handleButtonClick}
          color="mineshaft"
          variant="outline_bg"
          className="mt-2 mb-6 ml-auto mr-6"
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
      <Head>
        <title>Set Up Vercel Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
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
}

VercelCreateIntegrationPage.requireAuth = true;
