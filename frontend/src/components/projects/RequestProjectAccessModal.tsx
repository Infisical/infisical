import { useForm } from "react-hook-form";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalClose, ModalContent } from "@app/components/v2";
import { useRequestProjectAccess } from "@app/hooks/api";
import { Workspace } from "@app/hooks/api/workspace/types";

type ContentProps = {
  projectId: string;
  onComplete: () => void;
};

const Content = ({ projectId, onComplete }: ContentProps) => {
  const form = useForm<{ note: string }>();

  const requestProjectAccess = useRequestProjectAccess();

  const onFormSubmit = ({ note }: { note: string }) => {
    if (requestProjectAccess.isPending) return;
    requestProjectAccess.mutate(
      {
        comment: note,
        projectId
      },
      {
        onSuccess: () => {
          createNotification({
            type: "success",
            title: "Project Access Request Sent",
            text: "Project admins will receive an email of your request"
          });
          onComplete();
        }
      }
    );
  };

  return (
    <form onSubmit={form.handleSubmit(onFormSubmit)}>
      <FormControl label="Note">
        <Input {...form.register("note")} />
      </FormControl>
      <div className="mt-4 flex items-center">
        <Button className="mr-4" size="sm" type="submit" isLoading={form.formState.isSubmitting}>
          Submit Request
        </Button>
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            Cancel
          </Button>
        </ModalClose>
      </div>
    </form>
  );
};

type RequestProjectAccessModalProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  project?: Workspace;
  onComplete?: () => void;
};

export const RequestProjectAccessModal = ({
  isOpen,
  onOpenChange,
  project,
  onComplete
}: RequestProjectAccessModalProps) => {
  if (!project) return null;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Confirm Access Request"
        subTitle={`Requesting access to project ${project?.name}. You may include an optional note for project admins to review your request.`}
      >
        <Content
          onComplete={() => {
            onOpenChange(false);
            if (onComplete) onComplete();
          }}
          projectId={project?.id}
        />
      </ModalContent>
    </Modal>
  );
};
