import { useTranslation } from "react-i18next";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
    Button
} from "@app/components/v2";
import { usePopUp } from "@app/hooks";

import { AddOrgIncidentContactModal } from "./AddOrgIncidentContactModal";
import { OrgIncidentContactsTable } from "./OrgIncidentContactsTable";

export const OrgIncidentContactsSection = () => {
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
                <Button
                    colorSchema="secondary"
                    type="submit"
                    leftIcon={<FontAwesomeIcon icon={faPlus} />}
                    onClick={() => handlePopUpOpen("addContact")}
                >
                    Add contact
                </Button>
            </div>
            <OrgIncidentContactsTable />
            <AddOrgIncidentContactModal 
                popUp={popUp}
                handlePopUpClose={handlePopUpClose}
                handlePopUpToggle={handlePopUpToggle}
            />
        </div>
    );
}

