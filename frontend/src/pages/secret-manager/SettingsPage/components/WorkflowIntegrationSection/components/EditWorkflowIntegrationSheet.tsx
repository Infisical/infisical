import { useRef } from "react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@app/components/v3";
import { WorkflowIntegrationPlatform } from "@app/hooks/api/workflowIntegrations/types";

import { WORKFLOW_INTEGRATION_PLATFORM_LABELS } from "../constants";
import { MicrosoftTeamsIntegrationForm } from "./MicrosoftTeamsIntegrationForm";
import { SlackIntegrationForm } from "./SlackIntegrationForm";

type Props = {
  isOpen?: boolean;
  onClose: () => void;
  integration?: WorkflowIntegrationPlatform;
};

export const EditWorkflowIntegrationSheet = ({ isOpen, onClose, integration }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const platformLabel = integration ? WORKFLOW_INTEGRATION_PLATFORM_LABELS[integration] : "";

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(state) => {
        if (!state) {
          onClose();
        }
      }}
    >
      <SheetContent className="sm:max-w-lg">
        <div ref={containerRef} className="flex h-full min-h-0 flex-col">
          <SheetHeader>
            <SheetTitle>Edit {platformLabel} Integration</SheetTitle>
            <SheetDescription>
              Choose which events send notifications to {platformLabel}.
            </SheetDescription>
          </SheetHeader>
          {integration === WorkflowIntegrationPlatform.SLACK && (
            <SlackIntegrationForm onClose={onClose} menuContainer={containerRef} />
          )}
          {integration === WorkflowIntegrationPlatform.MICROSOFT_TEAMS && (
            <MicrosoftTeamsIntegrationForm onClose={onClose} menuContainer={containerRef} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
