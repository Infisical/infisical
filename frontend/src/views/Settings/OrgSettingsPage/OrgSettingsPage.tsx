import { useTranslation } from "react-i18next";

import {
  OrgIncidentContactsSection,
  OrgNameChangeSection,
  OrgServiceAccountsTable
} from "./components";

export const OrgSettingsPage = () => {
  const { t } = useTranslation();

  return (
    <div className="flex justify-center bg-bunker-800 text-white w-full py-6">
		<div className="max-w-7xl w-full px-6">
			<div className="mb-4">
				<p className="text-3xl font-semibold text-gray-200">{t("settings.org.title")}</p>
			</div>
			<OrgNameChangeSection />
			<OrgIncidentContactsSection />
			<div className="p-4 bg-mineshaft-900 rounded-lg border border-mineshaft-600">
				<OrgServiceAccountsTable />
			</div>
		</div>
    </div>
  );
};
