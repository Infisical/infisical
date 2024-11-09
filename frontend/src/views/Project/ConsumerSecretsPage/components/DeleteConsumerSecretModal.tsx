import { createNotification } from '@app/components/notifications';
import { DeleteActionModal } from '@app/components/v2';
import {
  TSecretNote,
  useDeleteSecretNote,
} from '@app/hooks/api/consumerSecrets';

type Props = {
  secretNote: TSecretNote;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const DeleteConsumerSecretModal = ({
  isOpen,
  onOpenChange,
  secretNote,
}: Props) => {
  const deleteConsumerSecret = useDeleteSecretNote();

  if (!secretNote) return null;

  const { id: noteId, projectId, name } = secretNote;

  const handleDeleteConsumerSecret = async () => {
    try {
      await deleteConsumerSecret.mutateAsync({
        noteId,
        projectId,
      });

      createNotification({
        text: 'Key successfully deleted',
        type: 'success',
      });

      onOpenChange(false);
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text = error?.response?.data?.message ?? 'Failed to delete key';

      createNotification({
        text,
        type: 'error',
      });
    }
  };

  return (
    <DeleteActionModal
      isOpen={isOpen}
      title={`Are you sure want to delete ${name}?`}
      onChange={onOpenChange}
      deleteKey="confirm"
      onDeleteApproved={handleDeleteConsumerSecret}
    />
  );
};
