import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan } from "@app/components/permissions";
import { Button } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { usePopUp } from "@app/hooks";

import { AddIntegrationModal } from "./AddIntegrationModal";
import { GitHubAppsTable } from "./GitHubAppsTable";
import { WorkflowIntegrationsTable } from "./WorkflowIntegrationsTable";

export const OrgIntegrationsSection = () => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["addIntegration"] as const);

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex justify-between">
        <p className="text-xl font-medium text-mineshaft-100">Integrations</p>
        <OrgPermissionCan I={OrgPermissionActions.Create} an={OrgPermissionSubjects.Settings}>
          {(isAllowed) => (
            <Button
              onClick={() => handlePopUpOpen("addIntegration")}
              isDisabled={!isAllowed}
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
            >
              Add
            </Button>
          )}
        </OrgPermissionCan>
      </div>
      <p className="mb-4 text-gray-400">
        Connect Infisical to other platforms for workflow notifications and app integrations.
      </p>

      <div className="mb-2 text-sm font-medium text-mineshaft-200">Workflow</div>
      <WorkflowIntegrationsTable />

      <div className="mt-6 mb-2 text-sm font-medium text-mineshaft-200">Apps</div>
      <GitHubAppsTable />

      <AddIntegrationModal
        isOpen={popUp.addIntegration.isOpen}
        onToggle={(state) => handlePopUpToggle("addIntegration", state)}
      />
    </div>
  );
};
