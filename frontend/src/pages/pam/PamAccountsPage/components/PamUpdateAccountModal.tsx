import { Modal, ModalContent } from "@app/components/v2";
import { TPamAccount } from "@app/hooks/api/pam";

import { PamAccountForm } from "./PamAccountForm/PamAccountForm";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  account?: TPamAccount;
};

export const PamUpdateAccountModal = ({ isOpen, onOpenChange, account }: Props) => {
  if (!account) return null;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-2xl" title="Edit Account" subTitle="Update account details.">
        <PamAccountForm
          onComplete={() => onOpenChange(false)}
          account={account}
          projectId={account.projectId}
        />
      </ModalContent>
    </Modal>
  );
};
