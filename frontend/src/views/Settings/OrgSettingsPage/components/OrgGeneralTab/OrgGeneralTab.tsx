import { useOrgPermission } from "@app/context";

import { OrgDeleteSection } from "../OrgDeleteSection";
import { OrgIncidentContactsSection } from "../OrgIncidentContactsSection";
import { OrgNameChangeSection } from "../OrgNameChangeSection";
import { OrgSlugChangeSection } from "../OrgSlugChangeSection";

export const OrgGeneralTab = () => {
  const { membership } = useOrgPermission();

  return (
    <div>
      <OrgNameChangeSection />
      <OrgSlugChangeSection />
      <OrgIncidentContactsSection />
      {membership && membership.role === "admin" && <OrgDeleteSection />}
    </div>
  );
};