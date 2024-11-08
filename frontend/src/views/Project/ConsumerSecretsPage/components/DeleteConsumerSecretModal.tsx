import { createNotification } from '@app/components/notifications';
import { DeleteActionModal } from '@app/components/v2';
import {
  TConsumerSecret,
  useDeleteConsumerSecret,
} from '@app/hooks/api/consumerSecrets';

type Props = {
  consumerSecret: TConsumerSecret;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const DeleteConsumerSecretModal = ({
  isOpen,
  onOpenChange,
  consumerSecret,
}: Props) => {
  const deleteConsumerSecret = useDeleteConsumerSecret();

  if (!consumerSecret) return null;

  const { id: keyId, projectId, name } = consumerSecret;

  const handleDeleteConsumerSecret = async () => {
    try {
      await deleteConsumerSecret.mutateAsync({
        keyId,
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
