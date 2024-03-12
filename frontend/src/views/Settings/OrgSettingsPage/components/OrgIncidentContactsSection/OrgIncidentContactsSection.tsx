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
    <>
      <hr className="border-mineshaft-600" />
      <div className="flex items-center justify-between pt-4">
        <p className="text-md text-mineshaft-100">{t("section.incident.incident-contacts")}</p>
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
