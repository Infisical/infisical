import { OrgIncidentContactsSection } from "../OrgIncidentContactsSection";
import { OrgNameChangeSection } from "../OrgNameChangeSection";
import { OrgServiceAccountsTable } from "../OrgServiceAccountsTable";

export const OrgGeneralTab = () => {
  return (
    <div>
      <OrgNameChangeSection />
      <OrgServiceAccountsTable />
      <OrgIncidentContactsSection />
    </div>
  );
};
