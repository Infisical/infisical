import { faArrowUpRightFromSquare, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
import {
  ProjectPermissionPkiSubscriberActions,
  ProjectPermissionSub,
  useWorkspace
} from "@app/context";
import { useDeletePkiSubscriber, useUpdatePkiSubscriber } from "@app/hooks/api";
import { PkiSubscriberStatus } from "@app/hooks/api/pkiSubscriber/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { PkiSubscriberModal } from "./PkiSubscriberModal";
import { PkiSubscribersTable } from "./PkiSubscribersTable";

export const PkiSubscriberSection = () => {
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace.id;
  const { mutateAsync: deletePkiSubscriber } = useDeletePkiSubscriber();
  const { mutateAsync: updatePkiSubscriber } = useUpdatePkiSubscriber();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "pkiSubscriber",
    "pkiSubscriberStatus", // enable / disable
    "deletePkiSubscriber"
  ] as const);

  const onRemovePkiSubscriberSubmit = async (subscriberName: string) => {
    try {
      const subscriber = await deletePkiSubscriber({ subscriberName, projectId });

      createNotification({
        text: `Successfully deleted PKI subscriber: ${subscriber.name}`,
        type: "success"
      });

      handlePopUpClose("deletePkiSubscriber");
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to delete PKI subscriber",
        type: "error"
      });
    }
  };

  const onUpdatePkiSubscriberStatus = async ({
    subscriberName,
    status
  }: {
    subscriberName: string;
    status: PkiSubscriberStatus;
  }) => {
    try {
      if (!currentWorkspace?.slug) return;

      await updatePkiSubscriber({ subscriberName, projectId, status });

      createNotification({
        text: `Successfully ${status === PkiSubscriberStatus.ACTIVE ? "enabled" : "disabled"} subscriber`,
        type: "success"
      });

      handlePopUpClose("pkiSubscriberStatus");
    } catch (err) {
      console.error(err);
      createNotification({
        text: `Failed to ${status === PkiSubscriberStatus.ACTIVE ? "enable" : "disable"} subscriber`,
        type: "error"
      });
    }
  };

  const subscriberStatusData = popUp?.pkiSubscriberStatus?.data as {
    status: PkiSubscriberStatus;
    subscriberName: string;
  };

  const isEnabling = subscriberStatusData?.status === PkiSubscriberStatus.ACTIVE;
  const subscriberName = subscriberStatusData?.subscriberName || "";

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">Subscribers</p>
        <div className="flex w-full justify-end">
          <a
            target="_blank"
            rel="noopener noreferrer"
            href="https://infisical.com/docs/documentation/platform/pki/subscribers"
          >
            <span className="flex w-max cursor-pointer items-center rounded-md border border-mineshaft-500 bg-mineshaft-600 px-4 py-2 text-mineshaft-200 duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-white">
              Documentation{" "}
              <FontAwesomeIcon
                icon={faArrowUpRightFromSquare}
                className="mb-[0.06rem] ml-1 text-xs"
              />
            </span>
          </a>
          <ProjectPermissionCan
            I={ProjectPermissionPkiSubscriberActions.Create}
            a={ProjectPermissionSub.PkiSubscribers}
          >
            {(isAllowed) => (
              <Button
                colorSchema="primary"
                type="submit"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={() => handlePopUpOpen("pkiSubscriber")}
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
