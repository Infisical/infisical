import { Modal, ModalContent } from "@app/components/v2";
import { NoticeBannerV2 } from "@app/components/v2/NoticeBannerV2/NoticeBannerV2";
import { ProjectPermissionActions } from "@app/context";
import { TAccessApprovalPolicy } from "@app/hooks/api/types";
import { SpecificPrivilegeSecretForm } from "@app/pages/project/AccessControlPage/components/MembersTab/components/MemberRoleForm/SpecificPrivilegeSection";

export const RequestAccessModal = ({
  isOpen,
  onOpenChange,
  policies,
  shouldShowBanner,
  ...props
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  policies: TAccessApprovalPolicy[];
  selectedActions?: ProjectPermissionActions[];
  secretPath?: string;
  shouldShowBanner?: boolean;
}) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-xl"
        title="Request Access"
        subTitle="Request access to any secrets and resources based on the predefined policies."
      >
        {shouldShowBanner && (
          <NoticeBannerV2
            className="mb-3"
            title="You do not have permission to perform this action"
          >
            <p className="text-sm text-mineshaft-300">
              Request access to gain access to this action.
            </p>
          </NoticeBannerV2>
        )}
        <SpecificPrivilegeSecretForm
          onClose={() => onOpenChange(false)}
          policies={policies}
          {...props}
        />
      </ModalContent>
    </Modal>
  );
};
