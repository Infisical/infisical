import { createNotification } from "@app/components/notifications";
import { DeleteActionModal } from "@app/components/v2";
import { PAM_RESOURCE_TYPE_MAP, TPamResource, useDeletePamResource } from "@app/hooks/api/pam";

type Props = {
  resource?: TPamResource;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const PamDeleteResourceModal = ({ isOpen, onOpenChange, resource }: Props) => {
  const deletePamResource = useDeletePamResource();

  if (!resource) return null;

  const { id: resourceId, name, resourceType } = resource;

  const handleDelete = async () => {
    await deletePamResource.mutateAsync({
      resourceId,
      resourceType
    });

    createNotification({
      text: `Successfully removed ${PAM_RESOURCE_TYPE_MAP[resourceType].name} resource`,
      type: "success"
    });

    onOpenChange(false);
  };

  return (
    <DeleteActionModal
      isOpen={isOpen}
      onChange={onOpenChange}
      title={`Are you sure you want to delete ${name}?`}
      deleteKey={name}
      onDeleteApproved={handleDelete}
    />
  );
};
