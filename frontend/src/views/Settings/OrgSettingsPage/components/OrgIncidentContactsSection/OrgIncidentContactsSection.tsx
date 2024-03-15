import { useTranslation } from "react-i18next";

import { PermissionDeniedBanner } from "@app/components/permissions";
import { OrgPermissionActions, OrgPermissionSubjects, useOrgPermission } from "@app/context";
import { usePopUp } from "@app/hooks";

import { AddOrgIncidentContactModal } from "./AddOrgIncidentContactModal";
import { OrgIncidentContactsTable } from "./OrgIncidentContactsTable";

export const OrgIncidentContactsSection = () => {
  const { t } = useTranslation();
  const { handlePopUpToggle, popUp, handlePopUpClose } = usePopUp([
    "addContact"
  ] as const);
  const { permission } = useOrgPermission();

  return (
    <>
      <hr className="border-mineshaft-600" />
      <p className="pt-4 text-md text-mineshaft-100">{t("section.incident.incident-contacts")}</p>
      <div className="py-4">
        {permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.IncidentAccount) ? (
          <OrgIncidentContactsTable />
        ) : (
          <PermissionDeniedBanner />
        )}
      </div>
      <AddOrgIncidentContactModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        handlePopUpToggle={handlePopUpToggle}
      />
    </>
  );
};
