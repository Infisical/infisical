import { createNotification } from "@app/components/notifications";
import { DeleteActionModal } from "@app/components/v2";
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
    try {
      await deleteTemplate.mutateAsync({
        templateId
      });

      createNotification({
        text: "Successfully removed project template",
        type: "success"
      });

      onOpenChange(false);
    } catch (err) {
      console.error(err);

      createNotification({
        text: "Failed remove project template",
        type: "error"
      });
    }
  };

  return (
    <DeleteActionModal
      isOpen={isOpen}
      onChange={onOpenChange}
      title={`Are you sure want to delete ${name}?`}
      deleteKey="confirm"
      onDeleteApproved={handleDeleteProjectTemplate}
    />
  );
};
