import { useOrgPermission } from "@app/context";

import { OrgDeleteSection } from "../OrgDeleteSection";
import { OrgIncidentContactsSection } from "../OrgIncidentContactsSection";
import { OrgNameChangeSection } from "../OrgNameChangeSection";

export const OrgGeneralTab = () => {
  const { membership } = useOrgPermission();

  return (
    <div>
      <OrgNameChangeSection />
      <OrgIncidentContactsSection />
      {membership && membership.role === "admin" && <OrgDeleteSection />}
    </div>
  );
};
