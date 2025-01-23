import { faArrowUpRightFromSquare, faBookOpen, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan } from "@app/components/permissions";
import { Button } from "@app/components/v2";
import { OrgPermissionSubjects } from "@app/context";
import { OrgPermissionAppConnectionActions } from "@app/context/OrgPermissionContext/types";
import { withPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";

import { AddAppConnectionModal, AppConnectionsTable } from "./components";

export const AppConnectionsTab = withPermission(
  () => {
    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["addConnection"] as const);

    return (
      <div>
        <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
          <div className="mb-4 flex items-center">
            <div>
              <div className="flex items-start gap-1">
                <p className="text-xl font-semibold text-mineshaft-100">App Connections</p>
                <a
                  href="https://infisical.com/docs/integrations/app-connections/overview"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <div className="ml-1 mt-[0.32rem] inline-block rounded-md bg-yellow/20 px-1.5 text-sm text-yellow opacity-80 hover:opacity-100">
                    <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                    <span>Docs</span>
                    <FontAwesomeIcon
                      icon={faArrowUpRightFromSquare}
                      className="mb-[0.07rem] ml-1.5 text-[10px]"
                    />
                  </div>
                </a>
              </div>
              <p className="text-sm text-bunker-300">
                Create and configure connections with third-party apps for re-use across Infisical
                projects
              </p>
            </div>
            <OrgPermissionCan
              I={OrgPermissionAppConnectionActions.Create}
              a={OrgPermissionSubjects.AppConnections}
            >
              {(isAllowed) => (
                <Button
                  colorSchema="secondary"
                  type="submit"
                  leftIcon={<FontAwesomeIcon icon={faPlus} />}
                  onClick={() => {
                    handlePopUpOpen("addConnection");
                  }}
                  isDisabled={!isAllowed}
                  className="ml-auto"
                >
                  Add Connection
                </Button>
              )}
            </OrgPermissionCan>
          </div>
          <AppConnectionsTable />
          <AddAppConnectionModal
            isOpen={popUp.addConnection.isOpen}
            onOpenChange={(isOpen) => handlePopUpToggle("addConnection", isOpen)}
          />
        </div>
      </div>
    );
  },
  {
    action: OrgPermissionAppConnectionActions.Read,
    subject: OrgPermissionSubjects.AppConnections
  }
);
