import { DeleteActionModal } from "@app/components/v2";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: () => Promise<void>;
  discoveryName: string;
};

export const DeleteDiscoveryModal = ({ isOpen, onOpenChange, onConfirm, discoveryName }: Props) => {
  return (
    <DeleteActionModal
      isOpen={isOpen}
      onChange={onOpenChange}
      title={`Delete discovery job "${discoveryName}"?`}
      subTitle="This action will also remove all associated scan history."
      deleteKey="confirm"
      onDeleteApproved={onConfirm}
    />
  );
};
