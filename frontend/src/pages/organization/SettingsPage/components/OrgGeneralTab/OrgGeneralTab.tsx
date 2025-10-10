import { useOrgPermission } from "@app/context";
import { OrgMembershipRole } from "@app/helpers/roles";

import { OrgDeleteSection } from "../OrgDeleteSection";
import { OrgIncidentContactsSection } from "../OrgIncidentContactsSection";
import { OrgNameChangeSection } from "../OrgNameChangeSection";

export const OrgGeneralTab = () => {
  const { hasOrgRole } = useOrgPermission();
  return (
    <div className="border-mineshaft-600 bg-mineshaft-900 mb-6 rounded-lg border p-6">
      <OrgNameChangeSection />
      <OrgIncidentContactsSection />
      {hasOrgRole(OrgMembershipRole.Admin) && <OrgDeleteSection />}
    </div>
  );
};
