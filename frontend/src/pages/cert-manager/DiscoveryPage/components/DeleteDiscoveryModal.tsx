import { ConfirmationAlertDialog } from "@app/components/v3/platform";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: () => Promise<void>;
  discoveryName: string;
};

export const DeleteDiscoveryModal = ({ isOpen, onOpenChange, onConfirm, discoveryName }: Props) => {
  return (
    <ConfirmationAlertDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={`Delete discovery job "${discoveryName}"?`}
      description="This action will also remove all associated scan history."
      confirmKey="confirm"
      onConfirm={onConfirm}
    />
  );
};
