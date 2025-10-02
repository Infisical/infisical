import { useOrgPermission } from "@app/context";

import { OrgDeleteSection } from "../OrgDeleteSection";
import { OrgIncidentContactsSection } from "../OrgIncidentContactsSection";
import { OrgNameChangeSection } from "../OrgNameChangeSection";
import { OrgMembershipRole } from "@app/helpers/roles";

export const OrgGeneralTab = () => {
  const { hasOrgRole } = useOrgPermission();
  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-6">
      <OrgNameChangeSection />
      <OrgIncidentContactsSection />
      {hasOrgRole(OrgMembershipRole.Admin) && <OrgDeleteSection />}
    </div>
  );
};
