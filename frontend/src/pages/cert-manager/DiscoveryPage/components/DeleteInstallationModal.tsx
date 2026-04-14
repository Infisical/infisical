import { DeleteActionModal } from "@app/components/v2";

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
    <DeleteActionModal
      isOpen={isOpen}
      onChange={onOpenChange}
      title={`Delete installation "${installationName}"?`}
      subTitle="This will remove the installation record and its certificate associations."
      deleteKey="confirm"
      onDeleteApproved={onConfirm}
    />
  );
};
