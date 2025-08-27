import { useEffect } from "react";
import { faLayerGroup } from "@fortawesome/free-solid-svg-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { Button, ContentLoader, EmptyState } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { getProjectHomePage } from "@app/helpers/project";
import { usePopUp } from "@app/hooks";
import { workspaceKeys } from "@app/hooks/api";
import { ProjectVersion } from "@app/hooks/api/workspace/types";
import { AddEnvironmentModal } from "@app/pages/secret-manager/SettingsPage/components/EnvironmentSection/AddEnvironmentModal";

import { SecretV2MigrationSection } from "./components/SecretV2MigrationSection";

export const OverviewPage = () => {
  const { currentWorkspace } = useWorkspace();
  const isProjectV3 = currentWorkspace?.version === ProjectVersion.V3;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp(["addEnvironment"] as const);

  useEffect(() => {
    if (currentWorkspace.environments.length) {
      navigate({
        to: getProjectHomePage(currentWorkspace.type, currentWorkspace.environments),
        params: {
          projectId: currentWorkspace.id
        }
      });
    }
  }, []);

  if (!isProjectV3)
    return (
      <div className="flex h-full w-full flex-col items-center justify-center px-6 text-mineshaft-50 dark:[color-scheme:dark]">
        <SecretV2MigrationSection />
      </div>
    );

  if (currentWorkspace.environments.length) {
    return <ContentLoader />;
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <AddEnvironmentModal
        isOpen={popUp.addEnvironment.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addEnvironment", isOpen)}
        onComplete={async (env) => {
          await queryClient.refetchQueries({
            queryKey: workspaceKeys.getWorkspaceById(currentWorkspace.id)
          });

          navigate({
            to: getProjectHomePage(currentWorkspace.type, [env]),
            params: {
              projectId: currentWorkspace.id
            }
          });
        }}
      />
      <EmptyState
        className="mx-auto max-w-md rounded-md"
        titleClassName="text-lg"
        title="No environments configured"
        icon={faLayerGroup}
      >
        <div className="flex flex-col gap-y-2 text-mineshaft-400">
          Create an environment to get started
          <Button
            className="mt-2"
            variant="outline_bg"
            onClick={() => handlePopUpOpen("addEnvironment")}
          >
            Add Environment
          </Button>
        </div>
      </EmptyState>
    </div>
  );
};
