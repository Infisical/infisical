import { useTranslation } from "react-i18next";

import NavHeader from "@app/components/navigation/NavHeader";

import {
  OrgIncidentContactsSection,
  OrgMembersSection,
  OrgNameChangeSection,
  OrgServiceAccountsTable
} from "./components";

export const OrgSettingsPage = () => {
  const { t } = useTranslation();

  return (
    <div className="flex justify-center bg-bunker-800 text-white w-full h-full px-6">
		<div className="max-w-screen-lg w-full">
      <NavHeader pageName={t("settings.org.title")} />
      <div className="my-8">
        <p className="text-3xl font-semibold text-gray-200">{t("settings.org.title")}</p>
      </div>
        <OrgNameChangeSection />
        <OrgMembersSection />
        <OrgIncidentContactsSection />
        <div className="mb-6 p-4 bg-mineshaft-900 max-w-screen-lg rounded-lg border border-mineshaft-600">
          <OrgServiceAccountsTable />
        </div>
        {/* <div className="border-l border-red pb-4 pl-6 flex flex-col items-start flex flex-col items-start w-full mb-6 mt-4 pt-2 max-w-6xl">
			<p className="text-xl font-bold text-red">
				Danger Zone
			</p>
			<p className="mt-4 text-md text-gray-400">
				As soon as you delete an organization, you will
				not be able to undo it. This will immediately
				remove all organization members and cancel your
				subscription. If you still want to do that,
				please enter the name of the organization below.
			</p>
			<div className="max-h-28 w-full max-w-xl mr-auto mt-8 max-w-xl">
				<InputField
					label="Organization to be Deleted"
					onChangeHandler={
						setWorkspaceToBeDeletedName
					}
					type="varName"
					value={workspaceToBeDeletedName}
					placeholder=""
					isRequired
				/>
			</div>
			<button
				type="button"
				className="mt-6 w-full max-w-xl inline-flex justify-center rounded-md border border-transparent bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-400 hover:bg-red hover:text-white hover:font-bold hover:text-semibold duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
				onClick={executeDeletingWorkspace}
			>
				Delete Project
			</button>
			<p className="mt-0.5 ml-1 text-xs text-gray-500">
				Note: You can only delete a project in case you
				have more than one.
			</p>
		</div> */}
		</div>
    </div>
  );
};
