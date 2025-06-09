import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan } from "@app/components/permissions";
import { Button } from "@app/components/v2";
import { OrgPermissionBillingActions, OrgPermissionSubjects } from "@app/context";
import { usePopUp } from "@app/hooks/usePopUp";

import { TaxIDModal } from "./TaxIDModal";
import { TaxIDTable } from "./TaxIDTable";

export const TaxIDSection = () => {
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "addTaxID"
  ] as const);

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-8 flex items-center">
        <h2 className="flex-1 text-xl font-semibold text-white">Tax ID</h2>
        <OrgPermissionCan
          I={OrgPermissionBillingActions.ManageBilling}
          a={OrgPermissionSubjects.Billing}
        >
          {(isAllowed) => (
            <Button
              onClick={() => handlePopUpOpen("addTaxID")}
              colorSchema="secondary"
              isDisabled={!isAllowed}
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
            >
              Add method
            </Button>
          )}
        </OrgPermissionCan>
      </div>
      <TaxIDTable />
      <TaxIDModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        handlePopUpToggle={handlePopUpToggle}
      />
    </div>
  );
};
