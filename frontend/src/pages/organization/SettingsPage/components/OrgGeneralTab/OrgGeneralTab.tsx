import { useOrganization, useOrgPermission } from "@app/context";
import { OrgMembershipRole } from "@app/helpers/roles";

import { OrgAiModelSection } from "../OrgAiModelSection";
import { OrgDeleteSection } from "../OrgDeleteSection";
import { OrgIncidentContactsSection } from "../OrgIncidentContactsSection";
import { OrgNameChangeSection, SubOrgNameChangeSection } from "../OrgNameChangeSection";

export const OrgGeneralTab = () => {
  const { hasOrgRole } = useOrgPermission();
  const { isSubOrganization } = useOrganization();
  return (
    <div className="flex flex-col gap-4">
      {isSubOrganization ? <SubOrgNameChangeSection /> : <OrgNameChangeSection />}
      {!isSubOrganization && <OrgIncidentContactsSection />}
      <OrgAiModelSection />
      {hasOrgRole(OrgMembershipRole.Admin) && <OrgDeleteSection />}
    </div>
  );
};
