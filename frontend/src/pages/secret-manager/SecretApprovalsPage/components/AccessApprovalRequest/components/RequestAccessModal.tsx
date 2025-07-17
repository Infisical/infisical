import { Modal, ModalContent } from "@app/components/v2";
import { ProjectPermissionActions } from "@app/context";
import { TAccessApprovalPolicy } from "@app/hooks/api/types";
import { SpecificPrivilegeSecretForm } from "@app/pages/project/AccessControlPage/components/MembersTab/components/MemberRoleForm/SpecificPrivilegeSection";

export const RequestAccessModal = ({
  isOpen,
  onOpenChange,
  policies,
  ...props
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  policies: TAccessApprovalPolicy[];
  selectedActions?: ProjectPermissionActions[];
  secretPath?: string;
}) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-xl"
        title="Request Access"
        subTitle="Request access to any secrets and resources based on the predefined policies."
      >
        <SpecificPrivilegeSecretForm
          onClose={() => onOpenChange(false)}
          policies={policies}
          {...props}
        />
      </ModalContent>
    </Modal>
  );
};
