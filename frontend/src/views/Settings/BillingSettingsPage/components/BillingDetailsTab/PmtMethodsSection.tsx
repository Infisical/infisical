
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  Button
} from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useAddOrgPmtMethod } from "@app/hooks/api";

import { PmtMethodsTable } from "./PmtMethodsTable";

export const PmtMethodsSection = () => {
    const { currentOrg } = useOrganization();
    const { mutateAsync, isLoading } = useAddOrgPmtMethod();
    
    const handleAddPmtMethodBtnClick = async () => {
        if (!currentOrg?._id) return;
        const url = await mutateAsync({
            organizationId: currentOrg._id,
            success_url: window.location.href,
            cancel_url: window.location.href
        });
        
        window.location.href = url;
    }
    
    return (
        <div className="p-4 bg-mineshaft-900 mb-6 rounded-lg border border-mineshaft-600">
            <div className="flex items-center mb-8">
                <h2 className="text-xl font-semibold flex-1 text-white">
                    Payment methods
                </h2>
                <Button
                    onClick={handleAddPmtMethodBtnClick}
                    colorSchema="secondary"
                    isLoading={isLoading}
                    leftIcon={<FontAwesomeIcon icon={faPlus} />}
                >
                    Add method
                </Button>
            </div>
            <PmtMethodsTable />
        </div>
    );
}