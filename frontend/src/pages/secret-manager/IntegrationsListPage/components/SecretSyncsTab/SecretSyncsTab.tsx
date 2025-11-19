import { useEffect, useState } from "react";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { ProjectPermissionCan } from "@app/components/permissions";
import { CreateSecretSyncModal } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Button, Spinner } from "@app/components/v2";
import { DocumentationLinkBadge } from "@app/components/v3";
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

  if (isSecretSyncsPending)
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-2">
        <Spinner />
      </div>
    );

  return (
    <>
      <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-lg font-medium text-mineshaft-100">Secret Syncs</p>
              <DocumentationLinkBadge href="https://infisical.com/docs/integrations/secret-syncs/overview" />
            </div>
            <p className="text-sm text-bunker-300">
              Use App Connections to sync secrets to third-party services.
            </p>
          </div>
          <ProjectPermissionCan
            I={ProjectPermissionSecretSyncActions.Create}
            a={ProjectPermissionSub.SecretSyncs}
          >
            {(isAllowed) => (
              <Button
                colorSchema="secondary"
                type="submit"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={() => handlePopUpOpen("addSync")}
                isDisabled={!isAllowed}
              >
                Add Sync
              </Button>
            )}
          </ProjectPermissionCan>
        </div>
        <SecretSyncsTable secretSyncs={secretSyncs} />
      </div>
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
