import { ConfirmationAlertDialog } from "@app/components/v3/platform";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: () => Promise<void>;
  installationName: string;
};

export const DeleteInstallationModal = ({
  isOpen,
  onOpenChange,
  onConfirm,
  installationName
}: Props) => {
  return (
    <ConfirmationAlertDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={`Delete installation "${installationName}"?`}
      description="This will remove the installation record and its certificate associations."
      confirmKey="confirm"
      onConfirm={onConfirm}
    />
  );
};
