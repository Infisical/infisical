import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import queryString from "query-string";

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
  useGetIntegrationAuthById
} from "../../../hooks/api/integrationAuth";
import { useGetWorkspaceById } from "../../../hooks/api/workspace";
import createIntegration from "../../api/integrations/createIntegration";

export default function NorthflankCreateIntegrationPage() {
  const router = useRouter();

  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);

  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");
  const { data: integrationAuthApps } = useGetIntegrationAuthApps({
    integrationAuthId: (integrationAuthId as string) ?? ""
  });

  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState("");
  const [secretPath, setSecretPath] = useState("/");
  const [targetApp, setTargetApp] = useState("");
  const [secretGroupList, setSecretGroupList] = useState<any>([]);
  const [targetSecretGroup, setTargetSecretGroup] = useState<any>("");

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (workspace) {
      setSelectedSourceEnvironment(workspace.environments[0].slug);
    }
  }, [workspace]);

  useEffect(() => {
    if (integrationAuthApps) {
      if (integrationAuthApps.length > 0) {
        setTargetApp(integrationAuthApps[0].name);
      } else {
        setTargetApp("none");
      }
    }
  }, [integrationAuthApps]);

  useEffect(() => {
    if (integrationAuthApps) {
      if (integrationAuthApps.length > 0) {
        const selectedApp = integrationAuthApps?.filter((integrationAuthApp) => integrationAuthApp.name === targetApp);
        setSecretGroupList(selectedApp[0].secretGroups);
        setTargetSecretGroup(selectedApp[0]?.secretGroups[0]);
      } else {
        setTargetSecretGroup("none");
      }
    }
  }, [targetApp])

  const handleButtonClick = async () => {
    try {
      if (!integrationAuth?._id) return;

      setIsLoading(true);

      await createIntegration({
        integrationAuthId: integrationAuth?._id,
        isActive: true,
        app: targetApp,
        appId:
          integrationAuthApps?.find((integrationAuthApp) => integrationAuthApp.name === targetApp)
            ?.appId ?? null,
        sourceEnvironment: selectedSourceEnvironment,
        targetEnvironment: null,
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
    targetApp ? (
    <div className="flex h-full w-full items-center justify-center">
      <Card className="max-w-md rounded-md p-8">
        <CardTitle className="text-center">Northflank Integration</CardTitle>
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
        <FormControl label="Northflank Project" className="mt-4">
          <Select
            value={targetApp}
            onValueChange={(val) => setTargetApp(val)}
            className="w-full border border-mineshaft-500"
            isDisabled={integrationAuthApps.length === 0}
          >
            {integrationAuthApps.length > 0 ? (
              integrationAuthApps.map((integrationAuthApp) => (
                <SelectItem
                  value={integrationAuthApp.name}
                  key={`target-environment-${integrationAuthApp.name}`}
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
        <FormControl label="Secret Group" className="mt-4">
          <Select
            value={targetSecretGroup}
            onValueChange={(val) => setTargetSecretGroup(val)}
            className="w-full border border-mineshaft-500"
            isDisabled={secretGroupList.length === 0}
          >
            {secretGroupList.length > 0 ? (
              secretGroupList.map((group: any) => (
                <SelectItem
                  value={group}
                  key={`target-secret-group-${group}`}
                >
                  {group}
                </SelectItem>
              ))
            ) : (
              <SelectItem value="none" key="target-secret-group-none">
                No secret groups found
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

NorthflankCreateIntegrationPage.requireAuth = true;
