import { useTranslation } from "react-i18next";
import { PlusIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
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
      <>
        <Card>
          <CardHeader>
            <CardTitle>
              Service Tokens
              <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/token" />
            </CardTitle>
            <CardDescription>{t("section.token.service-tokens-description")}</CardDescription>
            <CardAction>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Create}
                a={ProjectPermissionSub.ServiceTokens}
              >
                {(isAllowed) => (
                  <Button
                    variant="project"
                    onClick={() => {
                      handlePopUpOpen("createAPIToken");
                    }}
                    isDisabled={!isAllowed}
                  >
                    <PlusIcon />
                    Create Token
                  </Button>
                )}
              </ProjectPermissionCan>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ServiceTokenTable handlePopUpOpen={handlePopUpOpen} />
          </CardContent>
        </Card>
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
      </>
    );
  },
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.ServiceTokens }
);
