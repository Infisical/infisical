import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

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
  useGetIntegrationAuthById,
  useGetIntegrationAuthNorthflankSecretGroups
} from "@app/hooks/api/integrationAuth";
import { IntegrationsListPageTabs } from "@app/types/integrations";

export const NorthflankConfigurePage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useCreateIntegration();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState(
    currentProject.environments[0].slug
  );
  const [secretPath, setSecretPath] = useState("/");
  const [targetAppId, setTargetAppId] = useState("");
  const [targetSecretGroupId, setTargetSecretGroupId] = useState<string>("");

  const [isLoading, setIsLoading] = useState(false);

  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.NorthflankConfigurePage.id,
    select: (el) => el.integrationAuthId
  });

  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");
  const { data: integrationAuthApps } = useGetIntegrationAuthApps({
    integrationAuthId: (integrationAuthId as string) ?? ""
  });
  const { data: integrationAuthSecretGroups } = useGetIntegrationAuthNorthflankSecretGroups({
    integrationAuthId: (integrationAuthId as string) ?? "",
    appId: targetAppId
  });

  useEffect(() => {
    if (integrationAuthApps) {
      if (integrationAuthApps.length > 0) {
        // setTargetApp(integrationAuthApps[0].name);
        setTargetAppId(integrationAuthApps[0].appId as string);
      } else {
        // setTargetApp("none");
        setTargetAppId("none");
      }
    }
  }, [integrationAuthApps]);

  useEffect(() => {
    if (integrationAuthSecretGroups) {
      if (integrationAuthSecretGroups.length > 0) {
        // case: project has at least 1 secret group in Northflank
        setTargetSecretGroupId(integrationAuthSecretGroups[0].groupId);
      } else {
        // case: project has no secret groups in Northflank
        setTargetSecretGroupId("none");
      }
    }
  }, [integrationAuthSecretGroups]);

  const handleButtonClick = async () => {
    try {
      if (!integrationAuth?.id) return;

      setIsLoading(true);

      await mutateAsync({
        integrationAuthId: integrationAuth?.id,
        isActive: true,
        app: integrationAuthApps?.find(
          (integrationAuthApp) => integrationAuthApp.appId === targetAppId
        )?.name,
        appId: targetAppId,
        sourceEnvironment: selectedSourceEnvironment,
        targetServiceId: targetSecretGroupId,
        secretPath
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

  return integrationAuth && selectedSourceEnvironment && integrationAuthApps && targetAppId ? (
    <div className="flex h-full w-full items-center justify-center">
      <Card className="max-w-md rounded-md p-8">
        <CardTitle className="text-center">Northflank Integration</CardTitle>
        <FormControl label="Project Environment" className="mt-4">
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
        <FormControl label="Secrets Path">
          <Input
            value={secretPath}
            onChange={(evt) => setSecretPath(evt.target.value)}
            placeholder="Provide a path, default is /"
          />
        </FormControl>
        <FormControl label="Northflank Project" className="mt-4">
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
        {targetSecretGroupId !== "" && integrationAuthSecretGroups && (
          <FormControl label="Secret Group" className="mt-4">
            <Select
              value={targetSecretGroupId}
              onValueChange={(val) => setTargetSecretGroupId(val)}
              className="w-full border border-mineshaft-500"
              isDisabled={integrationAuthSecretGroups.length === 0}
            >
              {integrationAuthSecretGroups.length > 0 ? (
                integrationAuthSecretGroups.map((secretGroup: any) => (
                  <SelectItem
                    value={secretGroup.groupId}
                    key={`target-secret-group-${secretGroup.groupId}`}
                  >
                    {secretGroup.name}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="none" key="target-secret-group-none">
                  No secret groups found
                </SelectItem>
              )}
            </Select>
          </FormControl>
        )}
        <Button
          onClick={handleButtonClick}
          color="mineshaft"
          className="mt-4"
          isLoading={isLoading}
          isDisabled={integrationAuthApps.length === 0 || integrationAuthSecretGroups?.length === 0}
        >
          Create Integration
        </Button>
      </Card>
    </div>
  ) : (
    <div />
  );
};
