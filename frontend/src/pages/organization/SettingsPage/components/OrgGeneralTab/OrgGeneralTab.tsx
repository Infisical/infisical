import { useOrganization, useOrgPermission } from "@app/context";
import { OrgMembershipRole } from "@app/helpers/roles";

import { OrgDeleteSection } from "../OrgDeleteSection";
import { OrgIncidentContactsSection } from "../OrgIncidentContactsSection";
import { OrgNameChangeSection, SubOrgNameChangeSection } from "../OrgNameChangeSection";

export const OrgGeneralTab = () => {
  const { hasOrgRole } = useOrgPermission();
  const { isSubOrganization } = useOrganization();
  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-6">
      {isSubOrganization ? <SubOrgNameChangeSection /> : <OrgNameChangeSection />}
      {!isSubOrganization && <OrgIncidentContactsSection />}
      {hasOrgRole(OrgMembershipRole.Admin) && <OrgDeleteSection />}
    </div>
  );
};
