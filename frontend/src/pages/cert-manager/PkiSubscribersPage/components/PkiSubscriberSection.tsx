import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmationAlertDialog
} from "@app/components/v3";
import { LegacyPkiResource } from "@app/const/legacyPkiDeprecation";
import {
  ProjectPermissionPkiSubscriberActions,
  ProjectPermissionSub,
  useProject
} from "@app/context";
import { useDeletePkiSubscriber, useUpdatePkiSubscriber } from "@app/hooks/api";
import { PkiSubscriberStatus } from "@app/hooks/api/pkiSubscriber/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { LegacyPkiCreationBlockedModal } from "../../components/LegacyPkiCreationBlockedModal";
import { PkiSubscriberModal } from "./PkiSubscriberModal";
import { PkiSubscribersTable } from "./PkiSubscribersTable";

export const PkiSubscriberSection = () => {
  const { currentProject } = useProject();

  const { mutateAsync: deletePkiSubscriber } = useDeletePkiSubscriber();
  const { mutateAsync: updatePkiSubscriber } = useUpdatePkiSubscriber();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "pkiSubscriber",
    "pkiSubscriberStatus", // enable / disable
    "deletePkiSubscriber",
    "creationBlocked"
  ] as const);

  const onRemovePkiSubscriberSubmit = async (subscriberName: string) => {
    const subscriber = await deletePkiSubscriber({ subscriberName, projectId: currentProject.id });

    createNotification({
      text: `Successfully deleted PKI subscriber: ${subscriber.name}`,
      type: "success"
    });

    handlePopUpClose("deletePkiSubscriber");
  };

  const onUpdatePkiSubscriberStatus = async ({
    subscriberName,
    status
  }: {
    subscriberName: string;
    status: PkiSubscriberStatus;
  }) => {
    if (!currentProject?.slug) return;

    await updatePkiSubscriber({ subscriberName, status });

    createNotification({
      text: `Successfully ${status === PkiSubscriberStatus.ACTIVE ? "enabled" : "disabled"} subscriber`,
      type: "success"
    });

    handlePopUpClose("pkiSubscriberStatus");
  };

  const subscriberStatusData = popUp?.pkiSubscriberStatus?.data as {
    status: PkiSubscriberStatus;
    subscriberName: string;
  };

  const isEnabling = subscriberStatusData?.status === PkiSubscriberStatus.ACTIVE;
  const subscriberName = subscriberStatusData?.subscriberName || "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscribers</CardTitle>
        <CardAction>
          <div className="flex w-full justify-end">
            <ProjectPermissionCan
              I={ProjectPermissionPkiSubscriberActions.Create}
              a={ProjectPermissionSub.PkiSubscribers}
            >
              {(isAllowed) => (
                <Button
                  type="submit"
                  onClick={() => handlePopUpOpen("creationBlocked")}
                  isDisabled={!isAllowed}
                  variant="project"
                >
                  <FontAwesomeIcon icon={faPlus} />
                  Add Subscriber
                </Button>
              )}
            </ProjectPermissionCan>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        <PkiSubscribersTable handlePopUpOpen={handlePopUpOpen} />
      </CardContent>
      <PkiSubscriberModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <LegacyPkiCreationBlockedModal
        resource={LegacyPkiResource.PkiSubscriber}
        isOpen={popUp.creationBlocked.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("creationBlocked", isOpen)}
      />
      <ConfirmationAlertDialog
        isOpen={popUp.pkiSubscriberStatus.isOpen}
        title={`Are you sure you want to ${isEnabling ? "enable" : "disable"} the subscriber ${subscriberName}?`}
        description={
          isEnabling
            ? "This action will allow issuing certificates for this subscriber again."
            : "This action will prevent issuing certificates for this subscriber."
        }
        onOpenChange={(isOpen) => handlePopUpToggle("pkiSubscriberStatus", isOpen)}
        confirmKey="confirm"
        confirmVariant={isEnabling ? "project" : "danger"}
        confirmLabel={isEnabling ? "Enable" : "Disable"}
        onConfirm={() => onUpdatePkiSubscriberStatus(subscriberStatusData)}
      />
      <ConfirmationAlertDialog
        isOpen={popUp.deletePkiSubscriber.isOpen}
        description="This action is irreversible."
        title="Are you sure you want to remove the PKI subscriber?"
        onOpenChange={(isOpen) => handlePopUpToggle("deletePkiSubscriber", isOpen)}
        confirmKey="confirm"
        onConfirm={() =>
          onRemovePkiSubscriberSubmit(
            (popUp?.deletePkiSubscriber?.data as { subscriberName: string })?.subscriberName
          )
        }
      />
    </Card>
  );
};
