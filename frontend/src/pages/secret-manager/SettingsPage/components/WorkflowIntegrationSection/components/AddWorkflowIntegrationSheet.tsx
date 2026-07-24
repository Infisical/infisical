import { useRef, useState } from "react";
import { BsMicrosoftTeams, BsSlack } from "react-icons/bs";

import {
  Badge,
  Button,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useGetWorkspaceWorkflowIntegrationConfig } from "@app/hooks/api";
import { WorkflowIntegrationPlatform } from "@app/hooks/api/workflowIntegrations/types";

import { WORKFLOW_INTEGRATION_PLATFORM_LABELS } from "../constants";
import { MicrosoftTeamsIntegrationForm } from "./MicrosoftTeamsIntegrationForm";
import { SlackIntegrationForm } from "./SlackIntegrationForm";

type Props = {
  isOpen?: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

const PLATFORM_LIST = [
  {
    icon: <BsSlack className="text-lg" />,
    platform: WorkflowIntegrationPlatform.SLACK,
    title: "Slack"
  },
  {
    icon: <BsMicrosoftTeams className="text-lg" />,
    platform: WorkflowIntegrationPlatform.MICROSOFT_TEAMS,
    title: "Microsoft Teams"
  }
];

export const AddWorkflowIntegrationSheet = ({ isOpen, onOpenChange }: Props) => {
  const [selectedPlatform, setSelectedPlatform] = useState<WorkflowIntegrationPlatform | null>(
    null
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const { currentProject } = useProject();
  const { data: slackConfig } = useGetWorkspaceWorkflowIntegrationConfig({
    projectId: currentProject?.id ?? "",
    integration: WorkflowIntegrationPlatform.SLACK
  });
  const { data: microsoftTeamsConfig } = useGetWorkspaceWorkflowIntegrationConfig({
    projectId: currentProject?.id ?? "",
    integration: WorkflowIntegrationPlatform.MICROSOFT_TEAMS
  });

  const configuredPlatforms: Partial<Record<WorkflowIntegrationPlatform, boolean>> = {
    [WorkflowIntegrationPlatform.SLACK]: !!slackConfig,
    [WorkflowIntegrationPlatform.MICROSOFT_TEAMS]: !!microsoftTeamsConfig
  };

  const handleOpenChange = (state: boolean) => {
    onOpenChange(state);
    if (!state) {
      setSelectedPlatform(null);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <div ref={containerRef} className="flex h-full min-h-0 flex-col">
          <SheetHeader>
            <SheetTitle>
              {selectedPlatform
                ? `Configure ${WORKFLOW_INTEGRATION_PLATFORM_LABELS[selectedPlatform]} Integration`
                : "Add Workflow Integration"}
            </SheetTitle>
            <SheetDescription>
              {selectedPlatform
                ? `Choose which events send notifications to ${WORKFLOW_INTEGRATION_PLATFORM_LABELS[selectedPlatform]}.`
                : "Select the platform that will receive this project's notifications."}
            </SheetDescription>
          </SheetHeader>
          {!selectedPlatform && (
            <>
              <div className="flex thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto px-4">
                <div className="flex items-center gap-4">
                  {PLATFORM_LIST.map(({ icon, platform, title }) => (
                    <button
                      type="button"
                      key={platform}
                      onClick={() => setSelectedPlatform(platform)}
                      className="relative flex h-28 w-36 flex-col items-center justify-center gap-3 overflow-hidden rounded-md border border-border bg-container transition-colors hover:border-project/70 hover:bg-project/10"
                    >
                      {icon}
                      <span className="text-sm">{title}</span>
                      {configuredPlatforms[platform] && (
                        <Badge
                          variant="project"
                          isFullWidth
                          className="absolute inset-x-0 bottom-0 justify-center rounded-none"
                        >
                          Already configured
                        </Badge>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <SheetFooter className="justify-end border-t">
                <SheetClose asChild>
                  <Button type="button" variant="ghost">
                    Cancel
                  </Button>
                </SheetClose>
              </SheetFooter>
            </>
          )}
          {selectedPlatform === WorkflowIntegrationPlatform.SLACK && (
            <SlackIntegrationForm
              onClose={() => handleOpenChange(false)}
              onBack={() => setSelectedPlatform(null)}
              menuContainer={containerRef}
            />
          )}
          {selectedPlatform === WorkflowIntegrationPlatform.MICROSOFT_TEAMS && (
            <MicrosoftTeamsIntegrationForm
              onClose={() => handleOpenChange(false)}
              onBack={() => setSelectedPlatform(null)}
              menuContainer={containerRef}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
