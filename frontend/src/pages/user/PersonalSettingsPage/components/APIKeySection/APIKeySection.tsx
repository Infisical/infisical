import { useTranslation } from "react-i18next";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button, Tooltip } from "@app/components/v2";
import { usePopUp } from "@app/hooks/usePopUp";

import { AddAPIKeyModal } from "./AddAPIKeyModal";
import { APIKeyTable } from "./APIKeyTable";

export const APIKeySection = () => {
  const { t } = useTranslation();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["addAPIKey"] as const);

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-8 flex justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">
          {t("settings.personal.api-keys.title")}
        </p>
        <Tooltip content="API Keys are deprecated and will be removed in the future.">
          <Button
            isDisabled
            colorSchema="secondary"
            type="submit"
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
            onClick={() => handlePopUpOpen("addAPIKey")}
          >
            Add API Key
          </Button>
        </Tooltip>
      </div>
      <APIKeyTable />
      <AddAPIKeyModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
    </div>
  );
};
