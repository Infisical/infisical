import { createNotification } from "@app/components/notifications";
import { ConfirmationAlertDialog } from "@app/components/v3";
import { TProjectTemplate, useDeleteProjectTemplate } from "@app/hooks/api/projectTemplates";

type Props = {
  template?: TProjectTemplate;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const DeleteProjectTemplateModal = ({ isOpen, onOpenChange, template }: Props) => {
  const deleteTemplate = useDeleteProjectTemplate();

  if (!template) return null;

  const { id: templateId, name } = template;

  const handleDeleteProjectTemplate = async () => {
    await deleteTemplate.mutateAsync({
      templateId
    });

    createNotification({
      text: "Successfully removed project template",
      type: "success"
    });

    onOpenChange(false);
  };

  return (
    <ConfirmationAlertDialog
      isOpen={isOpen}
      description="This action is irreversible."
      onOpenChange={onOpenChange}
      title={`Are you sure you want to delete ${name}?`}
      confirmKey="confirm"
      onConfirm={handleDeleteProjectTemplate}
    />
  );
};
