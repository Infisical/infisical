import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
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
  const { mutateAsync, isPending: isLoading } = useCreateIntegration();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState(
    currentProject.environments[0].slug
  );
  const [secretPath, setSecretPath] = useState("/");
  const [targetAppId, setTargetAppId] = useState("");
  const [targetSecretGroupId, setTargetSecretGroupId] = useState<string>("");

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
      <PageTitle title="Set Up Northflank Integration" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Northflank Integration</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="NorthflankConfigurePage-field-1">Project Environment</FieldLabel>
            <Select
              value={selectedSourceEnvironment}
              onValueChange={(val) => setSelectedSourceEnvironment(val)}
            >
              <SelectTrigger
                id="NorthflankConfigurePage-field-1"
                aria-describedby="NorthflankConfigurePage-field-1-feedback"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currentProject?.environments.map((sourceEnvironment) => (
                  <SelectItem
                    value={sourceEnvironment.slug}
                    key={`source-environment-${sourceEnvironment.slug}`}
                  >
                    {sourceEnvironment.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="NorthflankConfigurePage-field-2">Secrets Path</FieldLabel>
            <Input
              id="NorthflankConfigurePage-field-2"
              aria-describedby="NorthflankConfigurePage-field-2-feedback"
              value={secretPath}
              onChange={(evt) => setSecretPath(evt.target.value)}
              placeholder="Provide a path, default is /"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="NorthflankConfigurePage-field-3">Northflank Project</FieldLabel>
            <Select
              value={targetAppId}
              onValueChange={(val) => setTargetAppId(val)}
              disabled={integrationAuthApps.length === 0}
            >
              <SelectTrigger
                id="NorthflankConfigurePage-field-3"
                aria-describedby="NorthflankConfigurePage-field-3-feedback"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
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
              </SelectContent>
            </Select>
          </Field>
          {targetSecretGroupId !== "" && integrationAuthSecretGroups && (
            <Field>
              <FieldLabel htmlFor="NorthflankConfigurePage-field-4">Secret Group</FieldLabel>
              <Select
                value={targetSecretGroupId}
                onValueChange={(val) => setTargetSecretGroupId(val)}
                disabled={integrationAuthSecretGroups.length === 0}
              >
                <SelectTrigger
                  id="NorthflankConfigurePage-field-4"
                  aria-describedby="NorthflankConfigurePage-field-4-feedback"
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
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
                </SelectContent>
              </Select>
            </Field>
          )}
        </CardContent>
        <CardFooter className="justify-end border-t pt-4">
          <Button
            onClick={handleButtonClick}
            isPending={isLoading}
            isDisabled={
              integrationAuthApps.length === 0 || integrationAuthSecretGroups?.length === 0
            }
            variant="project"
          >
            Create Integration
          </Button>
        </CardFooter>
      </Card>
    </div>
  ) : (
    <>
      <PageTitle title="Set Up Northflank Integration" />
      <div />
    </>
  );
};
