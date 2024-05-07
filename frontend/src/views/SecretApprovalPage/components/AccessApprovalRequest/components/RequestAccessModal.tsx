import { Modal, ModalContent } from "@app/components/v2";
import { TAccessApprovalPolicy } from "@app/hooks/api/types";
import { SpecificPrivilegeSecretForm } from "@app/views/Project/MembersPage/components/MemberListTab/MemberRoleForm/SpecificPrivilegeSection";

export const RequestAccessModal = ({
  isOpen,
  onOpenChange,
  policies
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  policies: TAccessApprovalPolicy[];
}) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-4xl"
        title="Request Access"
        subTitle="Your role has limited permissions, please contact your administrator to gain access"
      >
        <SpecificPrivilegeSecretForm onClose={() => onOpenChange(false)} policies={policies} />
      </ModalContent>
    </Modal>
  );
};
