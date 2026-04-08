import { createNotification } from "@app/components/notifications";
import { Button, Modal, ModalClose, ModalContent } from "@app/components/v2";
import { useTerminatePamSession } from "@app/hooks/api/pam";

type Props = {
  sessionId: string;
  projectId: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const PamTerminateSessionModal = ({ sessionId, projectId, isOpen, onOpenChange }: Props) => {
  const terminateSession = useTerminatePamSession();

  const handleTerminate = async () => {
    await terminateSession.mutateAsync(
      { sessionId, projectId },
      {
        onSuccess: () => {
          createNotification({
            text: "Session terminated successfully",
            type: "success"
          });
          onOpenChange(false);
        }
      }
    );
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Terminate Session"
        subTitle="Are you sure you want to terminate this session?"
        footerContent={
          <div className="mx-2 flex items-center">
            <Button
              className="mr-4"
              colorSchema="danger"
              isLoading={terminateSession.isPending}
              onClick={handleTerminate}
            >
              Terminate
            </Button>
            <ModalClose asChild>
              <Button variant="plain" colorSchema="secondary">
                Cancel
              </Button>
            </ModalClose>
          </div>
        }
      />
    </Modal>
  );
};
