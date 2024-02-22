import { useRouter } from "next/router";

import { Spinner } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useToggle } from "@app/hooks";
import { useGetUpgradeProjectStatus } from "@app/hooks/api/workspace/queries";
import { ProjectVersion } from "@app/hooks/api/workspace/types";

export const UpgradeOverlay = () => {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const [isUpgrading, setIsUpgrading] = useToggle(false);

  const isProjectRoute = router.pathname.includes("/project");

  const { isLoading: isUpgradeStatusLoading } = useGetUpgradeProjectStatus({
    projectId: currentWorkspace?.id ?? "",
    enabled: isProjectRoute && currentWorkspace && currentWorkspace.version === ProjectVersion.V1,
    refetchInterval: 5_000,
    onSuccess: (data) => {
      if (!data) return;

      if (data.status !== "IN_PROGRESS") {
        setIsUpgrading.off();
      } else if (data?.status === "IN_PROGRESS") {
        setIsUpgrading.on();
      }
    }
  });

  // make sure only to display this on /project routes
  if (!currentWorkspace || !isProjectRoute) {
    return null;
  }

  // for non admin this would throw an error
  // so no need to render
  return !isUpgradeStatusLoading && isUpgrading ? ( // isUpgrading
    <div className="absolute top-0 left-0 z-50 flex h-screen w-screen items-center justify-center bg-bunker-500 bg-opacity-80">
      <Spinner size="lg" className="text-primary" />
      <div className="ml-4 flex flex-col space-y-1">
        <div className="text-3xl font-medium text-white">Please wait</div>
        <span className="inline-block text-white">Upgrading your project...</span>
      </div>
    </div>
  ) : (
    <div />
  );
};
