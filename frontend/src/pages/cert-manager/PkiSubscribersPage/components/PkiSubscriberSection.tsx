import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
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
    <div className="mb-6 rounded-lg border border-border-control bg-surface-base p-4">
      <div className="mb-4 flex justify-between">
        <p className="text-xl font-medium text-foreground">Subscribers</p>
        <div className="flex w-full justify-end">
          <ProjectPermissionCan
            I={ProjectPermissionPkiSubscriberActions.Create}
            a={ProjectPermissionSub.PkiSubscribers}
          >
            {(isAllowed) => (
              <Button
                colorSchema="primary"
                type="submit"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={() => handlePopUpOpen("creationBlocked")}
                isDisabled={!isAllowed}
                className="ml-4"
              >
                Add Subscriber
              </Button>
            )}
          </ProjectPermissionCan>
        </div>
      </div>
      <PkiSubscribersTable handlePopUpOpen={handlePopUpOpen} />
      <PkiSubscriberModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <LegacyPkiCreationBlockedModal
        resource={LegacyPkiResource.PkiSubscriber}
        isOpen={popUp.creationBlocked.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("creationBlocked", isOpen)}
      />
      <DeleteActionModal
        isOpen={popUp.pkiSubscriberStatus.isOpen}
        title={`Are you sure you want to ${isEnabling ? "enable" : "disable"} the subscriber ${subscriberName}?`}
        subTitle={
          isEnabling
            ? "This action will allow issuing certificates for this subscriber again."
            : "This action will prevent issuing certificates for this subscriber."
        }
        onChange={(isOpen) => handlePopUpToggle("pkiSubscriberStatus", isOpen)}
        deleteKey="confirm"
        buttonColorSchema={isEnabling ? "primary" : "danger"}
        buttonText={isEnabling ? "Enable" : "Disable"}
        onDeleteApproved={() => onUpdatePkiSubscriberStatus(subscriberStatusData)}
      />
      <DeleteActionModal
        isOpen={popUp.deletePkiSubscriber.isOpen}
        title="Are you sure you want to remove the PKI subscriber?"
        onChange={(isOpen) => handlePopUpToggle("deletePkiSubscriber", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onRemovePkiSubscriberSubmit(
            (popUp?.deletePkiSubscriber?.data as { subscriberName: string })?.subscriberName
          )
        }
      />
    </div>
  );
};
