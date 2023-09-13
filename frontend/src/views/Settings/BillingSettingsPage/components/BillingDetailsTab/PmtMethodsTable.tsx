import { faCreditCard, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan } from "@app/components/permissions";
import {
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
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useDeleteOrgPmtMethod, useGetOrgPmtMethods } from "@app/hooks/api";

export const PmtMethodsTable = () => {
  const { currentOrg } = useOrganization();
  const { data, isLoading } = useGetOrgPmtMethods(currentOrg?._id ?? "");
  const deleteOrgPmtMethod = useDeleteOrgPmtMethod();

  const handleDeletePmtMethodBtnClick = async (pmtMethodId: string) => {
    if (!currentOrg?._id) return;
    await deleteOrgPmtMethod.mutateAsync({
      organizationId: currentOrg._id,
      pmtMethodId
    });
  };

  return (
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
          {!isLoading &&
            data &&
            data?.length > 0 &&
            data.map(({ _id, brand, exp_month, exp_year, funding, last4 }) => (
              <Tr key={`pmt-method-${_id}`} className="h-10">
                <Td>{brand.charAt(0).toUpperCase() + brand.slice(1)}</Td>
                <Td>{funding.charAt(0).toUpperCase() + funding.slice(1)}</Td>
                <Td>{last4}</Td>
                <Td>{`${exp_month}/${exp_year}`}</Td>
                <Td>
                  <OrgPermissionCan
                    I={OrgPermissionActions.Delete}
                    a={OrgPermissionSubjects.Billing}
                  >
                    {(isAllowed) => (
                      <IconButton
                        onClick={async () => {
                          await handleDeletePmtMethodBtnClick(_id);
                        }}
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
          {isLoading && <TableSkeleton columns={5} innerKey="pmt-methods" />}
          {!isLoading && data && data?.length === 0 && (
            <Tr>
              <Td colSpan={5}>
                <EmptyState title="No payment methods on file" icon={faCreditCard} />
              </Td>
            </Tr>
          )}
        </TBody>
      </Table>
    </TableContainer>
  );
};
