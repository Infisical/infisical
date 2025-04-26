import { Modal, ModalContent } from "@app/components/v2";
import { WorkflowIntegrationPlatform } from "@app/hooks/api/workflowIntegrations/types";

import { MicrosoftTeamsIntegrationForm } from "./MicrosoftTeamsIntegrationForm";
import { SlackIntegrationForm } from "./SlackIntegrationForm";

type Props = {
  isOpen?: boolean;
  onClose: () => void;

  integration: WorkflowIntegrationPlatform;
};

export const EditWorkflowIntegrationModal = ({ isOpen, onClose, integration }: Props) => {
  const handleFormReset = () => {
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={handleFormReset}>
      <ModalContent
        title={`Edit ${integration?.replace("-", " ").replace(/\b\w/g, (char) => char.toUpperCase()) ?? "workflow"} integration`}
      >
        {integration === WorkflowIntegrationPlatform.SLACK && (
          <SlackIntegrationForm onClose={handleFormReset} />
        )}
        {integration === WorkflowIntegrationPlatform.MICROSOFT_TEAMS && (
          <MicrosoftTeamsIntegrationForm onClose={handleFormReset} />
        )}
      </ModalContent>
    </Modal>
  );
};
