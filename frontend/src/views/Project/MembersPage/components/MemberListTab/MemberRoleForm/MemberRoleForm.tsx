import { TWorkspaceUser } from "@app/hooks/api/types";

import { MemberRbacSection } from "./MemberRbacSection";
import { SpecificPrivilegeSection } from "./SpecificPrivilegeSection";

type Props = {
  projectMember: TWorkspaceUser;
  onOpenUpgradeModal: (title: string) => void;
};
export const MemberRoleForm = ({ projectMember, onOpenUpgradeModal }: Props) => {
  return (
    <div>
      <MemberRbacSection
        projectMember={projectMember}
        onOpenUpgradeModal={onOpenUpgradeModal}
      />
      <SpecificPrivilegeSection membershipId={projectMember?.id} />
    </div>
  );
};
