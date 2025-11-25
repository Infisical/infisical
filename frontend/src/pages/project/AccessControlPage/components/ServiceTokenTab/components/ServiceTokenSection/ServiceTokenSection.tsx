import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useTranslation } from "react-i18next";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
import { DocumentationLinkBadge } from "@app/components/v3";
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
      await deleteServiceToken.mutateAsync(
        (popUp?.deleteAPITokenConfirmation?.data as DeleteModalData)?.id
      );
      createNotification({
        text: "Successfully deleted service token",
        type: "success"
      });

      handlePopUpClose("deleteAPITokenConfirmation");
    };

    return (
      <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-x-2">
              <p className="text-xl font-medium text-mineshaft-100">Service Tokens</p>
              <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/token" />
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
                variant="outline_bg"
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
