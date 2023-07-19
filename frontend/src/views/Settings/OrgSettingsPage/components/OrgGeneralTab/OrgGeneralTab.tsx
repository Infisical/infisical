import { OrgIncidentContactsSection } from "../OrgIncidentContactsSection";
import { OrgNameChangeSection } from "../OrgNameChangeSection";
import { OrgServiceAccountsTable } from "../OrgServiceAccountsTable";

export const OrgGeneralTab = () => {
    return (
        <div>
            <OrgNameChangeSection />
			<div className="p-4 bg-mineshaft-900 rounded-lg border border-mineshaft-600 mb-6">
				<OrgServiceAccountsTable />
			</div>
			<OrgIncidentContactsSection />
        </div>
    );
}