import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { useProjectPermission } from "@app/context";
import { useGetUpgradeProjectStatus, useUpgradeProject } from "@app/hooks/api";
import { Workspace } from "@app/hooks/api/types";
import { workspaceKeys } from "@app/hooks/api/workspace/queries";
import { ProjectVersion } from "@app/hooks/api/workspace/types";
import { queryClient } from "@app/reactQuery";

import { Button } from "../Button";
import { Tooltip } from "../Tooltip";

export type UpgradeProjectAlertProps = {
  project: Workspace;
  transparent?: boolean;
};

export const UpgradeProjectAlert = ({
  project,
  transparent
}: UpgradeProjectAlertProps): JSX.Element | null => {
  const router = useRouter();
  const { hasProjectRole } = useProjectPermission();
  const upgradeProject = useUpgradeProject();
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  const [isUpgrading, setIsUpgrading] = useState(false);

  const isProjectAdmin = hasProjectRole("admin");

  const {
    data: projectStatus,
    isLoading: statusIsLoading,
    refetch: manualProjectStatusRefetch
  } = useGetUpgradeProjectStatus({
    projectId: project.id,
    enabled: isProjectAdmin && project.version === ProjectVersion.V1,
    refetchInterval: 5_000,
    onSuccess: (data) => {
      if (!isProjectAdmin) {
        return;
      }

      if (data && data?.status !== null) {
        if (data.status === "IN_PROGRESS") {
          setCurrentStatus("Your upgrade is being processed.");
        } else if (data.status === "FAILED") {
          setCurrentStatus("Upgrade failed, please try again.");
        }
      }

      if (currentStatus !== null && data?.status === null) {
        queryClient.invalidateQueries(workspaceKeys.getAllUserWorkspace);
        router.reload();
      }
    }
  });

  const onUpgradeProject = useCallback(async () => {
    if (upgradeProject.isLoading) {
      return;
    }
    setIsUpgrading(true);
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

    manualProjectStatusRefetch();

    setTimeout(() => setIsUpgrading(false), 5_000);
  }, []);

  const isLoading =
    isUpgrading ||
    ((upgradeProject.isLoading ||
      currentStatus !== null ||
      (currentStatus === null && statusIsLoading)) &&
      projectStatus?.status !== "FAILED");

  if (project.version !== ProjectVersion.V1) return null;

  if (transparent) {
    return (
      <Button
        colorSchema="primary"
        variant="solid"
        size="md"
        isLoading={isLoading}
        isDisabled={isLoading || !isProjectAdmin}
        onClick={onUpgradeProject}
      >
        Upgrade
      </Button>
    );
  }

  return (
    <div
      className={twMerge(
        "mt-4 flex w-full flex-row items-center rounded-md border border-primary-600/70  bg-primary/[.07] p-4 text-base text-white",
        !isProjectAdmin && "opacity-80"
      )}
    >
      <FontAwesomeIcon icon={faWarning} className="pr-6 text-6xl text-white/80" />
      <div className="flex w-full flex-col text-sm">
        <span className="mb-2 text-lg font-semibold">Upgrade your project</span>
        {isProjectAdmin ? (
          <>
            <p>
              Upgrade your project version to continue receiving the latest improvements and
              patches.
            </p>
            <Link href="https://infisical.com/docs/documentation/platform/project-upgrade">
              <a target="_blank" className="text-primary-400">
                Learn more
              </a>
            </Link>
          </>
        ) : (
          <>
            <p>
              <span className="font-bold">Please ask a project admin to upgrade the project.</span>
              <br />
              Upgrading the project version is required to continue receiving the latest
              improvements and patches.
            </p>
            <Link href="https://infisical.com/docs/documentation/platform/project-upgrade">
              <a target="_blank" className="text-primary-400">
                Learn more
              </a>
            </Link>
          </>
        )}
        {currentStatus && <p className="mt-2 opacity-80">Status: {currentStatus}</p>}
      </div>
      <div className="my-2">
        <Tooltip
          className={twMerge(isProjectAdmin && "hidden")}
          content="You need to be an admin to upgrade the project."
        >
          <Button
            isLoading={isLoading}
            isDisabled={isLoading || !isProjectAdmin}
            onClick={onUpgradeProject}
          >
            Upgrade
          </Button>
        </Tooltip>
      </div>
    </div>
  );
};
