import { ConfirmationAlertDialog } from "@app/components/v3";
import { PamAccountType, usePamAccountTypeMap } from "@app/hooks/api/pam";

type Props = {
  isOpen: boolean;
  accountName: string;
  accountType?: PamAccountType;
  isLoading: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
};

export const DeleteAccountModal = ({
  isOpen,
  accountName,
  accountType,
  isLoading,
  onConfirm,
  onOpenChange
}: Props) => {
  const { map } = usePamAccountTypeMap();
  const typeName = accountType ? map[accountType]?.name : "";

  return (
    <ConfirmationAlertDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={`Delete "${accountName}"`}
      description={`This permanently deletes the${typeName ? ` ${typeName}` : ""} account. This cannot be undone.`}
      confirmKey={accountName}
      isPending={isLoading}
      onConfirm={onConfirm}
    />
  );
};
