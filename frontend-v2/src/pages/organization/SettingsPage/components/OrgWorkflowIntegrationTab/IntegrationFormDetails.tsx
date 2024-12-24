import { Modal, ModalContent } from "@app/components/v2";
import { WorkflowIntegrationPlatform } from "@app/hooks/api/workflowIntegrations/types";

import { SlackIntegrationForm } from "./SlackIntegrationForm";

type Props = {
  isOpen: boolean;
  id: string;
  workflowPlatform: WorkflowIntegrationPlatform;
  onOpenChange: (state: boolean) => void;
};

export const IntegrationFormDetails = ({ isOpen, id, onOpenChange, workflowPlatform }: Props) => {
  const modalTitle =
    workflowPlatform === WorkflowIntegrationPlatform.SLACK ? "Slack integration" : "Integration";

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent title={modalTitle}>
        {workflowPlatform === WorkflowIntegrationPlatform.SLACK && (
          <SlackIntegrationForm id={id} onClose={() => onOpenChange(false)} />
        )}
      </ModalContent>
    </Modal>
  );
};
