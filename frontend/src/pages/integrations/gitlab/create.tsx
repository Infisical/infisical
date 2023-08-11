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
  useGetIntegrationAuthTeams
} from "../../../hooks/api/integrationAuth";
import { useGetWorkspaceById } from "../../../hooks/api/workspace";

const gitLabEntities = [
  { name: "Individual", value: "individual" },
  { name: "Group", value: "group" }
];

export default function GitLabCreateIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useCreateIntegration();

  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);

  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");

  const [targetTeamId, setTargetTeamId] = useState<string | null>(null);

  const { data: integrationAuthApps } = useGetIntegrationAuthApps({
    integrationAuthId: (integrationAuthId as string) ?? "",
    ...(targetTeamId ? { teamId: targetTeamId } : {})
  });
  const { data: integrationAuthTeams } = useGetIntegrationAuthTeams(
    (integrationAuthId as string) ?? ""
  );

  const [targetEntity, setTargetEntity] = useState(gitLabEntities[0].value);
  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState("");
  const [secretPath, setSecretPath] = useState("/");
  const [targetAppId, setTargetAppId] = useState("");
  const [targetEnvironment, setTargetEnvironment] = useState("");

  const [isLoading, setIsLoading] = useState(false);

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

  useEffect(() => {
    if (targetEntity === "group" && integrationAuthTeams && integrationAuthTeams.length > 0) {
      if (integrationAuthTeams) {
        if (integrationAuthTeams.length > 0) {
          // case: user is part of at least 1 group in GitLab
          setTargetTeamId(integrationAuthTeams[0].teamId);
        } else {
          // case: user is not part of any groups in GitLab
          setTargetTeamId("none");
        }
      }
    } else if (targetEntity === "individual") {
      setTargetTeamId(null);
    }
  }, [targetEntity, integrationAuthTeams]);

  const handleButtonClick = async () => {
    try {
      setIsLoading(true);
      if (!integrationAuth?._id) return;

      await mutateAsync({
        integrationAuthId: integrationAuth?._id,
        isActive: true,
        app:
          integrationAuthApps?.find(
            (integrationAuthApp) => integrationAuthApp.appId === targetAppId
          )?.name ?? null,
        appId: targetAppId,
        sourceEnvironment: selectedSourceEnvironment,
        targetEnvironment: targetEnvironment === "" ? "*" : targetEnvironment,
        targetEnvironmentId: null,
        targetService: null,
        targetServiceId: null,
        owner: null,
        path: null,
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
    integrationAuthTeams &&
    targetAppId ? (
    <div className="flex h-full w-full items-center justify-center">
      <Card className="max-w-md rounded-md p-8">
        <CardTitle className="text-center">GitLab Integration</CardTitle>
        <FormControl label="Project Environment">
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
        <FormControl label="GitLab Integration Type">
          <Select
            value={targetEntity}
            onValueChange={(val) => setTargetEntity(val)}
            className="w-full border border-mineshaft-500"
          >
            {gitLabEntities.map((entity) => {
              return (
                <SelectItem value={entity.value} key={`target-entity-${entity.value}`}>
                  {entity.name}
                </SelectItem>
              );
            })}
          </Select>
        </FormControl>
        {targetEntity === "group" && targetTeamId && (
          <FormControl label="GitLab Group">
            <Select
              value={targetTeamId}
              onValueChange={(val) => setTargetTeamId(val)}
              className="w-full border border-mineshaft-500"
            >
              {integrationAuthTeams.length > 0 ? (
                integrationAuthTeams.map((integrationAuthTeam) => (
                  <SelectItem
                    value={integrationAuthTeam.teamId}
                    key={`target-team-${integrationAuthTeam.teamId}`}
                  >
                    {integrationAuthTeam.name}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="none" key="target-team-none">
                  No groups found
                </SelectItem>
              )}
            </Select>
          </FormControl>
        )}
        <FormControl label="GitLab Project">
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
                  key={`target-app-${integrationAuthApp.appId}`}
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
        <FormControl label="GitLab Environment Scope (Optional)">
          <Input
            placeholder="*"
            value={targetEnvironment}
            onChange={(e) => setTargetEnvironment(e.target.value)}
          />
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

GitLabCreateIntegrationPage.requireAuth = true;
