import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import queryString from "query-string";

import {
  useCreateIntegration
} from "@app/hooks/api";

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
  const { data: integrationAuthApps } = useGetIntegrationAuthApps({
    integrationAuthId: (integrationAuthId as string) ?? ""
  });

  const { data: branches } = useGetIntegrationAuthVercelBranches({
    integrationAuthId: integrationAuthId as string,
    appId: targetAppId
  });

  const filteredBranches = branches?.filter((branchName) => branchName !== "main").concat("");

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
      if (!integrationAuth?._id) return;

      setIsLoading(true);

      const targetApp = integrationAuthApps?.find(
        (integrationAuthApp) => integrationAuthApp.appId === targetAppId
      );

      if (!targetApp || !targetApp.appId) return;

      const path = targetEnvironment === "preview" && targetBranch !== "" ? targetBranch : null;

      await mutateAsync({
        integrationAuthId: integrationAuth?._id,
        isActive: true,
        app: targetApp.name,
        appId: targetApp.appId,
        sourceEnvironment: selectedSourceEnvironment,
        targetEnvironment,
        targetEnvironmentId: null,
        targetService: null,
        targetServiceId: null,
        owner: null,
        path,
        region: null,
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
    <div className="flex h-full w-full items-center justify-center">
      <Card className="max-w-md rounded-md p-8">
        <CardTitle className="text-center">Vercel Integration</CardTitle>
        <FormControl label="Project Environment" className="mt-4">
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
        <FormControl label="Secrets Path">
          <Input
            value={secretPath}
            onChange={(evt) => setSecretPath(evt.target.value)}
            placeholder="Provide a path, default is /"
          />
        </FormControl>
        <FormControl label="Vercel App">
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
        <FormControl label="Vercel App Environment">
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
          <FormControl label="Vercel Preview Branch (Optional)">
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
          className="mt-4"
          isLoading={isLoading}
          isDisabled={integrationAuthApps.length === 0}
        >
          Create Integration
        </Button>
      </Card>
    </div>
  ) : (
    <div />
  );
}

VercelCreateIntegrationPage.requireAuth = true;
