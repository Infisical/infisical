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
  useGetIntegrationAuthGitHubRepositories,
  useGetIntegrationAuthById,
} from "../../../hooks/api/integrationAuth";
import { useGetWorkspaceById } from "../../../hooks/api/workspace";

export default function GitHubEnvironmentCreateIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useCreateIntegration();

  const [targetRepositoryId, setTargetRepositoryId] = useState("");
  const [targetRepositoryName, setTargetRepositoryName] = useState("");
  const [targetEnvironmentId, setTargetEnvironmentId] = useState("");

  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState("");
  const [secretPath, setSecretPath] = useState("/");
  const [isLoading, setIsLoading] = useState(false);

  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");
  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: targetRepositories } = useGetIntegrationAuthGitHubRepositories((integrationAuthId as string) ?? "");
  const { data: integrationAuthApps } = useGetIntegrationAuthApps({
    integrationAuthId: (integrationAuthId as string) ?? "",
    workspaceSlug: targetRepositories?.find(repo => repo.id === targetRepositoryId)?.name ?? "none"
  });

  useEffect(() => {
    if (workspace) {
      setSelectedSourceEnvironment(workspace.environments[0].slug);
    }
  }, [workspace]);

  useEffect(() => {
    if (integrationAuthApps) {
      if (integrationAuthApps.length > 0) {
        setTargetEnvironmentId(integrationAuthApps[0].appId as string);
      } else {
        setTargetEnvironmentId("none");
      }
    }
  }, [integrationAuthApps]);

  // useEffect(() => {
  //   if (targetRepositories) {
  //     if (targetRepositories.length > 0) {
  //       setTargetRepositoryName(targetRepositories[0].name);
  //     } else {
  //       setTargetRepositoryName("none")
  //     }
  //   }
  // }, [targetRepositoryId]);

  useEffect(() => {
    if (targetRepositories) {
      if (targetRepositories.length > 0) {
        setTargetRepositoryId(targetRepositories[0].id);
        setTargetRepositoryName(targetRepositories[0].name);
      } else {
        setTargetRepositoryId("none");
        setTargetRepositoryName("none")
      }
    }
  }, [targetRepositories]);

  const handleButtonClick = async () => {
    try {
      setIsLoading(true);

      if (!integrationAuth?._id) return;

      // const targetApp = integrationAuthApps?.find(
      //   (integrationAuthApp) => integrationAuthApp.appId === targetAppId
      // );
      const targetEnvironment = integrationAuthApps?.find(
        (app) => app.appId === targetEnvironmentId
      );

      const targetRepository = targetRepositories?.find(
        (repository) => repository.id === targetRepositoryId
      );


      if (!targetRepository || !targetEnvironment) return;
      await mutateAsync({
        integrationAuthId: integrationAuth?._id,
        isActive: true,
        app: targetEnvironment.name,
        appId: String(targetEnvironment.appId),
        sourceEnvironment: selectedSourceEnvironment,
        targetEnvironment: targetRepository.name,
        targetEnvironmentId: String(targetRepository.id),
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
    targetRepositories ? (
    <div className="flex h-full w-full items-center justify-center">
      <Card className="max-w-md rounded-md p-8">
        <CardTitle className="text-center">GitHub Integration</CardTitle>
        <FormControl label="Project Environment" className="mt-4">
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
        <FormControl label="Secrets Path">
          <Input
            value={secretPath}
            onChange={(evt) => setSecretPath(evt.target.value)}
            placeholder="Provide a path, default is /"
          />
        </FormControl>
        <FormControl label="GitHub Repositories">
          <Select
            value={targetRepositoryId}
            onValueChange={(val) => setTargetRepositoryId(val)}
            className="w-full border border-mineshaft-500"
            isDisabled={targetRepositories.length === 0}
          >
            {targetRepositories.length > 0 ? (
              targetRepositories.map((targetRepository) => (
                <SelectItem
                  value={targetRepository.id as string}
                  key={`target-environment-${targetRepository.id as string}`}
                >
                  {targetRepository.name}
                </SelectItem>
              ))
            ) : (
              <SelectItem value="none" key="target-environment-none">
                No Repositories found
              </SelectItem>
            )}
          </Select>
        </FormControl>
        <FormControl label="GitHub Environment">
          <Select
            value={targetEnvironmentId}
            onValueChange={(val) => setTargetEnvironmentId(val)}
            className="w-full border border-mineshaft-500"
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
                No environments found
              </SelectItem>
            )}
          </Select>
        </FormControl>
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

GitHubEnvironmentCreateIntegrationPage.requireAuth = true;
