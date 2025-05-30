import { faCreditCard, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  DeleteActionModal,
  EmptyState,
  IconButton,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { OrgPermissionBillingActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteOrgPmtMethod, useGetOrgPmtMethods } from "@app/hooks/api";

export const PmtMethodsTable = () => {
  const { currentOrg } = useOrganization();
  const { data, isPending } = useGetOrgPmtMethods(currentOrg?.id ?? "");
  const deleteOrgPmtMethod = useDeleteOrgPmtMethod();
  const { handlePopUpOpen, handlePopUpClose, handlePopUpToggle, popUp } = usePopUp([
    "removeCard"
  ] as const);

  const pmtMethodToRemove = popUp.removeCard.data as { id: string; last4: string } | undefined;

  const handleDeletePmtMethodBtnClick = async () => {
    if (!currentOrg?.id || !pmtMethodToRemove) return;
    try {
      await deleteOrgPmtMethod.mutateAsync({
        organizationId: currentOrg.id,
        pmtMethodId: pmtMethodToRemove.id
      });
      createNotification({
        type: "success",
        text: "Successfully removed payment method"
      });
      handlePopUpClose("removeCard");
    } catch (error: any) {
      createNotification({
        type: "error",
        text: error.message ?? "Error removing payment method"
      });
    }
  };

  return (
    <>
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th className="flex-1">Brand</Th>
              <Th className="flex-1">Type</Th>
              <Th className="flex-1">Last 4 Digits</Th>
              <Th className="flex-1">Expiration</Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {!isPending &&
              data &&
              data?.length > 0 &&
              data.map(({ _id: id, brand, exp_month, exp_year, funding, last4 }) => (
                <Tr key={`pmt-method-${id}`} className="h-10">
                  <Td>{brand.charAt(0).toUpperCase() + brand.slice(1)}</Td>
                  <Td>{funding.charAt(0).toUpperCase() + funding.slice(1)}</Td>
                  <Td>{last4}</Td>
                  <Td>{`${exp_month}/${exp_year}`}</Td>
                  <Td>
                    <OrgPermissionCan
                      I={OrgPermissionBillingActions.ManageBilling}
                      a={OrgPermissionSubjects.Billing}
                    >
                      {(isAllowed) => (
                        <IconButton
                          onClick={() => handlePopUpOpen("removeCard", { id, last4 })}
                          size="lg"
                          isDisabled={!isAllowed}
                          colorSchema="danger"
                          variant="plain"
                          ariaLabel="update"
                        >
                          <FontAwesomeIcon icon={faXmark} />
                        </IconButton>
                      )}
                    </OrgPermissionCan>
                  </Td>
                </Tr>
              ))}
            {isPending && <TableSkeleton columns={5} innerKey="pmt-methods" />}
            {!isPending && data && data?.length === 0 && (
              <Tr>
                <Td colSpan={5}>
                  <EmptyState title="No payment methods on file" icon={faCreditCard} />
                </Td>
              </Tr>
            )}
          </TBody>
        </Table>
      </TableContainer>
      <DeleteActionModal
        isOpen={popUp.removeCard.isOpen}
        deleteKey="confirm"
        onChange={(isOpen) => handlePopUpToggle("removeCard", isOpen)}
        title={`Remove payment method ending in *${pmtMethodToRemove?.last4}?`}
        onDeleteApproved={handleDeletePmtMethodBtnClick}
      />
    </>
  );
};
