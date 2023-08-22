import { useTranslation } from "react-i18next";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan } from "@app/components/permissions";
import { Button } from "@app/components/v2";
import { GeneralPermissionActions, OrgPermissionSubjects } from "@app/context";
import { withPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";

import { AddOrgIncidentContactModal } from "./AddOrgIncidentContactModal";
import { OrgIncidentContactsTable } from "./OrgIncidentContactsTable";

export const OrgIncidentContactsSection = withPermission(
  () => {
    const { t } = useTranslation();
    const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
      "addContact"
    ] as const);

    return (
      <div className="p-4 bg-mineshaft-900 rounded-lg border border-mineshaft-600">
        <div className="flex justify-between mb-4">
          <p className="min-w-max text-xl font-semibold">
            {t("section.incident.incident-contacts")}
          </p>
          <OrgPermissionCan
            I={GeneralPermissionActions.Create}
            a={OrgPermissionSubjects.IncidentAccount}
          >
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
        <OrgIncidentContactsTable />
        <AddOrgIncidentContactModal
          popUp={popUp}
          handlePopUpClose={handlePopUpClose}
          handlePopUpToggle={handlePopUpToggle}
        />
      </div>
    );
  },
  { action: GeneralPermissionActions.Read, subject: OrgPermissionSubjects.IncidentAccount }
);
