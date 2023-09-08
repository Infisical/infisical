import { OrgIncidentContactsSection } from "../OrgIncidentContactsSection";
import { OrgNameChangeSection } from "../OrgNameChangeSection";

export const OrgGeneralTab = () => {
  return (
    <div>
      <OrgNameChangeSection />
      <OrgIncidentContactsSection />
    </div>
  );
};
