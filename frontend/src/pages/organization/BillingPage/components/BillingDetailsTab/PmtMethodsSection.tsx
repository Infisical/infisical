import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan } from "@app/components/permissions";
import { Button } from "@app/components/v2";
import { OrgPermissionBillingActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useAddOrgPmtMethod } from "@app/hooks/api";

import { PmtMethodsTable } from "./PmtMethodsTable";

export const PmtMethodsSection = () => {
  const { currentOrg } = useOrganization();
  const { mutateAsync, isPending } = useAddOrgPmtMethod();

  const handleAddPmtMethodBtnClick = async () => {
    if (!currentOrg?.id) return;
    const url = await mutateAsync({
      organizationId: currentOrg.id,
      success_url: window.location.href,
      cancel_url: window.location.href
    });

    window.location.href = url;
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-8 flex items-center">
        <h2 className="flex-1 text-xl font-semibold text-white">Payment methods</h2>
        <OrgPermissionCan
          I={OrgPermissionBillingActions.ManageBilling}
          a={OrgPermissionSubjects.Billing}
        >
          {(isAllowed) => (
            <Button
              onClick={handleAddPmtMethodBtnClick}
              colorSchema="secondary"
              isLoading={isPending}
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              isDisabled={!isAllowed}
            >
              Add method
            </Button>
          )}
        </OrgPermissionCan>
      </div>
      <PmtMethodsTable />
    </div>
  );
};
