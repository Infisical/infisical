import { useOrgPermission } from "@app/context";

import { OrgDeleteSection } from "../OrgDeleteSection";
import { OrgIncidentContactsSection } from "../OrgIncidentContactsSection";
import { OrgNameChangeSection } from "../OrgNameChangeSection";

export const OrgGeneralTab = () => {
  const { membership } = useOrgPermission();
  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-6">
      <OrgNameChangeSection />
      <OrgIncidentContactsSection />
      {membership && membership.role === "admin" && <OrgDeleteSection />}
    </div>
  );
};
