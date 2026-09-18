import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { CreateSecretSyncModal } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionSub, useOrganization, useProject } from "@app/context";
import { ProjectPermissionSecretSyncActions } from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import { useListSecretSyncs } from "@app/hooks/api/secretSyncs";

import { SecretSyncsTable } from "./SecretSyncTable";

export const SecretSyncsTab = () => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["addSync"] as const);
  const [initialSyncFormData, setInitialSyncFormData] = useState<Partial<TSecretSyncForm>>();

  const { addSync, connectionId, connectionName, ...search } = useSearch({
    from: ROUTE_PATHS.SecretManager.IntegrationsListPage.id
  });

  const navigate = useNavigate();

  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  useEffect(() => {
    if (!addSync) return;

    handlePopUpOpen("addSync", addSync);
    navigate({
      to: ROUTE_PATHS.SecretManager.IntegrationsListPage.path,
      params: {
        projectId: currentProject.id,
        orgId: currentOrg.id
      },
      search
    });
  }, [addSync]);

  useEffect(() => {
    if (connectionId && connectionName) {
      const storedFormData = localStorage.getItem("secretSyncFormData");

      if (!storedFormData) return;

      let form: Partial<TSecretSyncForm> = {};
      try {
        form = JSON.parse(storedFormData) as TSecretSyncForm;
      } catch {
        return;
      } finally {
        localStorage.removeItem("secretSyncFormData");
      }

      handlePopUpOpen("addSync", form.destination);

      setInitialSyncFormData({
        ...form,
        connection: { id: connectionId, name: connectionName }
      });

      navigate({
        to: ROUTE_PATHS.SecretManager.IntegrationsListPage.path,
        params: {
          orgId: currentOrg.id,
          projectId: currentProject.id
        },
        search
      });
    }
  }, [connectionId, connectionName]);

  const { data: secretSyncs = [], isPending: isSecretSyncsPending } = useListSecretSyncs(
    currentProject.id,
    {
      refetchInterval: 30000
    }
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            Secret Syncs
            <DocumentationLinkBadge href="https://infisical.com/docs/integrations/secret-syncs/overview" />
          </CardTitle>
          <CardDescription>
            Use App Connections to sync secrets to third-party services.
          </CardDescription>
          <CardAction>
            <ProjectPermissionCan
              I={ProjectPermissionSecretSyncActions.Create}
              a={ProjectPermissionSub.SecretSyncs}
            >
              {(isAllowed) => (
                <Button
                  variant="project"
                  onClick={() => handlePopUpOpen("addSync")}
                  isDisabled={!isAllowed}
                >
                  <PlusIcon />
                  Add Sync
                </Button>
              )}
            </ProjectPermissionCan>
          </CardAction>
        </CardHeader>
        <CardContent>
          <SecretSyncsTable secretSyncs={secretSyncs} isPending={isSecretSyncsPending} />
        </CardContent>
      </Card>
      <CreateSecretSyncModal
        selectSync={popUp.addSync.data}
        isOpen={popUp.addSync.isOpen}
        initialFormData={initialSyncFormData}
        onOpenChange={(isOpen) => {
          if (!isOpen) setInitialSyncFormData(undefined);
          handlePopUpToggle("addSync", isOpen);
        }}
      />
    </>
  );
};
