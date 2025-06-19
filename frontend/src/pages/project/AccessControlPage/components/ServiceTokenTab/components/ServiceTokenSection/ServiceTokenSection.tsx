import { useTranslation } from "react-i18next";
import { faArrowUpRightFromSquare, faBookOpen, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { withProjectPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import { useDeleteServiceToken } from "@app/hooks/api";

import { AddServiceTokenModal } from "./AddServiceTokenModal";
import { ServiceTokenTable } from "./ServiceTokenTable";

type DeleteModalData = { name: string; id: string };

export const ServiceTokenSection = withProjectPermission(
  () => {
    const { t } = useTranslation();

    const deleteServiceToken = useDeleteServiceToken();

    const { popUp, handlePopUpToggle, handlePopUpClose, handlePopUpOpen } = usePopUp([
      "createAPIToken",
      "deleteAPITokenConfirmation"
    ] as const);

    const onDeleteApproved = async () => {
      try {
        deleteServiceToken.mutateAsync(
          (popUp?.deleteAPITokenConfirmation?.data as DeleteModalData)?.id
        );
        createNotification({
          text: "Successfully deleted service token",
          type: "success"
        });

        handlePopUpClose("deleteAPITokenConfirmation");
      } catch (err) {
        console.error(err);
        createNotification({
          text: "Failed to delete service token",
          type: "error"
        });
      }
    };

    return (
      <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1">
              <p className="text-xl font-semibold text-mineshaft-100">Service Tokens</p>
              <a
                href="https://infisical.com/docs/documentation/platform/token"
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="ml-1 mt-[0.16rem] inline-block rounded-md bg-yellow/20 px-1.5 text-sm text-yellow opacity-80 hover:opacity-100">
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
              {t("section.token.service-tokens-description")}
            </p>
          </div>
          <ProjectPermissionCan
            I={ProjectPermissionActions.Create}
            a={ProjectPermissionSub.ServiceTokens}
          >
            {(isAllowed) => (
              <Button
                colorSchema="secondary"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={() => {
                  handlePopUpOpen("createAPIToken");
                }}
                isDisabled={!isAllowed}
              >
                Create Token
              </Button>
            )}
          </ProjectPermissionCan>
        </div>
        <ServiceTokenTable handlePopUpOpen={handlePopUpOpen} />
        <AddServiceTokenModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
        <DeleteActionModal
          isOpen={popUp.deleteAPITokenConfirmation.isOpen}
          title={`Delete ${
            (popUp?.deleteAPITokenConfirmation?.data as DeleteModalData)?.name || " "
          } service token?`}
          onChange={(isOpen) => handlePopUpToggle("deleteAPITokenConfirmation", isOpen)}
          deleteKey={(popUp?.deleteAPITokenConfirmation?.data as DeleteModalData)?.name}
          onClose={() => handlePopUpClose("deleteAPITokenConfirmation")}
          onDeleteApproved={onDeleteApproved}
        />
      </div>
    );
  },
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.ServiceTokens }
);
