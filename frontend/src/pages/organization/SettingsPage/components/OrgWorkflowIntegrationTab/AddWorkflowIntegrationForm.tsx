import { useState } from "react";
import { BsMicrosoftTeams, BsSlack } from "react-icons/bs";

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v3";
import { WorkflowIntegrationPlatform } from "@app/hooks/api/workflowIntegrations/types";

import { MicrosoftTeamsIntegrationForm } from "./MicrosoftTeamsIntegrationForm";
import { SlackIntegrationForm } from "./SlackIntegrationForm";

type Props = {
  isOpen?: boolean;
  onToggle: (isOpen: boolean) => void;
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

const PLATFORM_TITLES: Record<WorkflowIntegrationPlatform, string> = {
  [WorkflowIntegrationPlatform.SLACK]: "Slack",
  [WorkflowIntegrationPlatform.MICROSOFT_TEAMS]: "Microsoft Teams"
};

export const AddWorkflowIntegrationForm = ({ isOpen, onToggle }: Props) => {
  const [selectedPlatform, setSelectedPlatform] = useState<WorkflowIntegrationPlatform | null>(
    null
  );

  const handleOpenChange = (state: boolean) => {
    onToggle(state);
    if (!state) {
      setSelectedPlatform(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {selectedPlatform
              ? `Connect ${PLATFORM_TITLES[selectedPlatform]}`
              : "Add Workflow Integration"}
          </DialogTitle>
          <DialogDescription>
            {selectedPlatform
              ? `Connect a ${PLATFORM_TITLES[selectedPlatform]} ${
                  selectedPlatform === WorkflowIntegrationPlatform.SLACK ? "workspace" : "tenant"
                } for your organization's notification and approval workflows.`
              : "Select a platform to connect for notification and approval workflows."}
          </DialogDescription>
        </DialogHeader>
        {!selectedPlatform && (
          <>
            <div className="flex items-center gap-4">
              {PLATFORM_LIST.map(({ icon, platform, title }) => (
                <button
                  type="button"
                  key={platform}
                  onClick={() => setSelectedPlatform(platform)}
                  className="flex h-28 w-36 flex-col items-center justify-center gap-3 rounded-md border border-border bg-container transition-colors hover:border-org/70 hover:bg-org/10"
                >
                  {icon}
                  <span className="text-sm">{title}</span>
                </button>
              ))}
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
            </DialogFooter>
          </>
        )}
        {selectedPlatform === WorkflowIntegrationPlatform.SLACK && (
          <SlackIntegrationForm
            onClose={() => handleOpenChange(false)}
            onBack={() => setSelectedPlatform(null)}
          />
        )}
        {selectedPlatform === WorkflowIntegrationPlatform.MICROSOFT_TEAMS && (
          <MicrosoftTeamsIntegrationForm
            onClose={() => handleOpenChange(false)}
            onBack={() => setSelectedPlatform(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
