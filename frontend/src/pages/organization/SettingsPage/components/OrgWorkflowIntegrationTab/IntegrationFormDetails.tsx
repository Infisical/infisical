import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@app/components/v3";
import { WorkflowIntegrationPlatform } from "@app/hooks/api/workflowIntegrations/types";

import { MicrosoftTeamsIntegrationForm } from "./MicrosoftTeamsIntegrationForm";
import { SlackIntegrationForm } from "./SlackIntegrationForm";

type Props = {
  isOpen: boolean;
  id: string;
  workflowPlatform: WorkflowIntegrationPlatform;
  onOpenChange: (state: boolean) => void;
};

const PLATFORM_TITLES: Record<WorkflowIntegrationPlatform, string> = {
  [WorkflowIntegrationPlatform.SLACK]: "Slack",
  [WorkflowIntegrationPlatform.MICROSOFT_TEAMS]: "Microsoft Teams"
};

export const IntegrationFormDetails = ({ isOpen, id, onOpenChange, workflowPlatform }: Props) => {
  const platformTitle = workflowPlatform ? PLATFORM_TITLES[workflowPlatform] : "";

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{platformTitle} Integration</DialogTitle>
          <DialogDescription>
            View and update this {platformTitle} integration&apos;s details.
          </DialogDescription>
        </DialogHeader>
        {workflowPlatform === WorkflowIntegrationPlatform.SLACK && (
          <SlackIntegrationForm id={id} onClose={() => onOpenChange(false)} />
        )}
        {workflowPlatform === WorkflowIntegrationPlatform.MICROSOFT_TEAMS && (
          <MicrosoftTeamsIntegrationForm id={id} onClose={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
};
