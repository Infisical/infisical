import { useTranslation } from "react-i18next";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@app/components/v2";
import { usePopUp } from "@app/hooks/usePopUp";

import { AddAPIKeyModal } from "./AddAPIKeyModal";
import { APIKeyTable } from "./APIKeyTable";

export const APIKeySection = () => {
    const { t } = useTranslation();
    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
        "addAPIKey"
    ] as const);

    return (
        <div className="mb-6 p-4 bg-mineshaft-900 rounded-lg border border-mineshaft-600">
            <div className="flex justify-between mb-8">
                <p className="text-xl font-semibold text-mineshaft-100">
                    {t("settings.personal.api-keys.title")}
                </p>
                <Button
                    colorSchema="secondary"
                    type="submit"
                    leftIcon={<FontAwesomeIcon icon={faPlus} />}
                    onClick={() => handlePopUpOpen("addAPIKey")}
                >
                    Add API Key
                </Button>
            </div>
            <APIKeyTable />
            <AddAPIKeyModal 
                popUp={popUp}
                handlePopUpToggle={handlePopUpToggle}
            />
        </div>
    );
}