import { createNotification } from "@app/components/notifications";
import { DeleteActionModal } from "@app/components/v2";
import { TPamAccount, useDeletePamAccount } from "@app/hooks/api/pam";

type Props = {
  account?: TPamAccount;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const PamDeleteAccountModal = ({ isOpen, onOpenChange, account }: Props) => {
  const deletePamAccount = useDeletePamAccount();

  if (!account) return null;

  const {
    id: accountId,
    name,
    resource: { resourceType }
  } = account;

  const handleDelete = async () => {
    await deletePamAccount.mutateAsync({
      accountId,
      resourceType
    });

    createNotification({
      text: "Successfully deleted account",
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
