
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@app/components/v2";
import { usePopUp } from "@app/hooks/usePopUp";

import { TaxIDModal } from "./TaxIDModal";
import { TaxIDTable } from "./TaxIDTable";

export const TaxIDSection = () => {
    const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
        "addTaxID"
    ] as const);

    return (
        <div className="p-4 bg-mineshaft-900 mb-6 max-w-screen-lg rounded-lg border border-mineshaft-600">
            <div className="flex items-center mb-8">
                <h2 className="text-xl font-semibold flex-1 text-white">
                    Tax ID
                </h2>
                <Button
                    onClick={() => handlePopUpOpen("addTaxID")}
                    colorSchema="secondary"
                    leftIcon={<FontAwesomeIcon icon={faPlus} />}
                >
                    Add method
                </Button>
            </div>
            <TaxIDTable />
            <TaxIDModal 
                popUp={popUp}
                handlePopUpClose={handlePopUpClose}
                handlePopUpToggle={handlePopUpToggle}
            />
        </div>    
    );
}