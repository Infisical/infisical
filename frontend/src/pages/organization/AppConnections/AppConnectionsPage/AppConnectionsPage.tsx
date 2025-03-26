import { Helmet } from "react-helmet";
import { faArrowUpRightFromSquare, faBookOpen, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan } from "@app/components/permissions";
import { Button, PageHeader } from "@app/components/v2";
import {
  OrgPermissionAppConnectionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { withPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import {
  AddAppConnectionModal,
  AppConnectionsTable
} from "@app/pages/organization/AppConnections/AppConnectionsPage/components";

export const AppConnectionsPage = withPermission(
  () => {
    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["addConnection"] as const);

    return (
      <div className="bg-bunker-800">
        <Helmet>
          <title>Infisical | App Connections</title>
          <link rel="icon" href="/infisical.ico" />
          <meta property="og:image" content="/images/message.png" />
        </Helmet>
        <div className="flex w-full justify-center bg-bunker-800 text-white">
          <div className="w-full max-w-7xl">
            <PageHeader
              className="w-full"
              title={
                <div className="flex w-full items-center">
                  <span>App Connections</span>
                  <a
                    className="-mt-1.5"
                    href="https://infisical.com/docs/integrations/app-connections/overview"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <div className="ml-2 inline-block rounded-md bg-yellow/20 px-1.5 text-sm font-normal text-yellow opacity-80 hover:opacity-100">
                      <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                      <span>Docs</span>
                      <FontAwesomeIcon
                        icon={faArrowUpRightFromSquare}
                        className="mb-[0.07rem] ml-1.5 text-[10px]"
                      />
                    </div>
                  </a>
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
              }
              description="Create and configure connections with third-party apps for re-use across Infisical projects"
            />
            <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
              <AppConnectionsTable />
              <AddAppConnectionModal
                isOpen={popUp.addConnection.isOpen}
                onOpenChange={(isOpen) => handlePopUpToggle("addConnection", isOpen)}
              />
            </div>
          </div>
        </div>
      </div>
    );
  },
  {
    action: OrgPermissionAppConnectionActions.Read,
    subject: OrgPermissionSubjects.AppConnections
  }
);
