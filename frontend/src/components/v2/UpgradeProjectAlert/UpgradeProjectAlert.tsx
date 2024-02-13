import { useCallback, useEffect, useState } from "react";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { useGetUpgradeProjectStatus, useUpgradeProject } from "@app/hooks/api";
import { Workspace } from "@app/hooks/api/types";

import { Alert } from "../Alert";
import { Button } from "../Button";

export type UpgradeProjectAlertProps = {
  project: Workspace;
};

export const UpgradeProjectAlert = ({ project }: UpgradeProjectAlertProps): JSX.Element | null => {
  const { createNotification } = useNotificationContext();
  const upgradeProject = useUpgradeProject();
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  const {
    data: projectStatus,
    refetch: getLatestProjectStatus,
    isLoading: statusIsLoading
  } = useGetUpgradeProjectStatus(project.id);

  const onUpgradeProject = useCallback(async () => {
    const PRIVATE_KEY = localStorage.getItem("PRIVATE_KEY");

    if (!PRIVATE_KEY) {
      createNotification({
        type: "error",
        text: "Private key not found"
      });
      return;
    }

    await upgradeProject.mutateAsync({
      projectId: project.id,
      privateKey: PRIVATE_KEY
    });

    await getLatestProjectStatus();
  }, []);

  useEffect(() => {
    if (project.version === "v1") {
      getLatestProjectStatus();
    }

    if (projectStatus && projectStatus?.status !== null) {
      if (projectStatus.status === "IN_PROGRESS") {
        setCurrentStatus("Your upgrade is being processed.");
      } else if (projectStatus.status === "FAILED") {
        setCurrentStatus("Upgrade failed, please try again.");
      }
    }

    const interval = setInterval(() => {
      if (project.version === "v1") {
        getLatestProjectStatus();
      }
    }, 5_000);

    return () => {
      clearInterval(interval);
    };
  }, [projectStatus]);

  const isLoading =
    (upgradeProject.isLoading ||
      currentStatus !== null ||
      (currentStatus === null && statusIsLoading)) &&
    projectStatus?.status !== "FAILED";

  if (project.version !== "v1") return null;

  return (
    <div className="my-8">
      <Alert title="Upgrade your project" variant="warning">
        <div className="max-w-md">
          Upgrade your project version to continue receiving the latest improvements and patches.
          {currentStatus && <p className="mt-2 opacity-80">Status: {currentStatus}</p>}
        </div>
        <div className="mt-2">
          <Button isLoading={isLoading} isDisabled={isLoading} onClick={onUpgradeProject}>
            Upgrade
          </Button>
        </div>
      </Alert>
    </div>
  );
};
