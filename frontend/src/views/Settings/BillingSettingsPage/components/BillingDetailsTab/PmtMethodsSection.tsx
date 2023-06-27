import { faPlus } from "@fortawesome/free-solid-svg-icons";

import Button from "@app/components/basic/buttons/Button";
import { useOrganization } from "@app/context";
import { useAddOrgPmtMethod } from "@app/hooks/api";

import { PmtMethodsTable } from "./PmtMethodsTable";

export const PmtMethodsSection = () => {
    const { currentOrg } = useOrganization();
    const addOrgPmtMethod = useAddOrgPmtMethod();
    
    const handleAddPmtMethodBtnClick = async () => {
        if (!currentOrg?._id) return;
        const url = await addOrgPmtMethod.mutateAsync({
            organizationId: currentOrg._id,
            success_url: window.location.href,
            cancel_url: window.location.href
        });
        
        window.location.href = url;
    }
    
    return (
        <div className="p-4 bg-mineshaft-900 mt-8 max-w-screen-lg rounded-lg border border-mineshaft-600">
            <div className="flex items-center mb-8">
                <h2 className="text-xl font-semibold flex-1 text-white">
                    Payment Methods
                </h2>
                <div className="inline-block">
                    <Button
                        text="Add method"
                        type="submit"
                        color="mineshaft"
                        size="md"
                        icon={faPlus}
                        onButtonPressed={handleAddPmtMethodBtnClick}
                    />
                </div>
            </div>
            <PmtMethodsTable />
        </div>
    );
}