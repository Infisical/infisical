import { IdentityMembership } from "@app/hooks/api/identities/types";

import { IdentityRbacSection } from "./IdentityRbacSection";
import { SpecificPrivilegeSection } from "./SpecificPrivilegeSection";

type Props = {
  identityProjectMember: IdentityMembership;
  onOpenUpgradeModal: (title: string) => void;
};
export const IdentityRoleForm = ({ identityProjectMember, onOpenUpgradeModal }: Props) => {
  return (
    <div>
      <IdentityRbacSection
        identityProjectMember={identityProjectMember}
        onOpenUpgradeModal={onOpenUpgradeModal}
      />
      <SpecificPrivilegeSection identityId={identityProjectMember?.identity?.id} />
    </div>
  );
};
