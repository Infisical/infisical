import { useTranslation } from "react-i18next";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan, PermissionDeniedBanner } from "@app/components/permissions";
import { Button } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useOrgPermission } from "@app/context";
import { usePopUp } from "@app/hooks";

import { AddOrgIncidentContactModal } from "./AddOrgIncidentContactModal";
import { OrgIncidentContactsTable } from "./OrgIncidentContactsTable";

export const OrgIncidentContactsSection = () => {
  const { t } = useTranslation();
  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "addContact"
  ] as const);
  const { permission } = useOrgPermission();

  return (
    <div className="p-4 bg-mineshaft-900 mb-6 rounded-lg border border-mineshaft-600">
      <div className="flex justify-between mb-4">
        <p className="min-w-max text-xl font-semibold">{t("section.incident.incident-contacts")}</p>
        <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.IncidentAccount}>
          {(isAllowed) => (
            <Button
              colorSchema="secondary"
              type="submit"
              isDisabled={!isAllowed}
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => handlePopUpOpen("addContact")}
            >
              Add contact
            </Button>
          )}
        </OrgPermissionCan>
      </div>
      {permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.IncidentAccount) ? (
        <OrgIncidentContactsTable />
      ) : (
        <PermissionDeniedBanner />
      )}
      <AddOrgIncidentContactModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        handlePopUpToggle={handlePopUpToggle}
      />
    </div>
  );
};
