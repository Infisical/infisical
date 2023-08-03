import { faCircleCheck, faCircleXmark, faFileInvoice } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  EmptyState,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useGetOrgPlanTable } from "@app/hooks/api";

export const CurrentPlanSection = () => {
  const { currentOrg } = useOrganization();
  const { data, isLoading } = useGetOrgPlanTable(currentOrg?._id ?? "");

  const displayCell = (value: null | number | string | boolean) => {
    if (value === null) return "-";

    if (typeof value === "boolean") {
      if (value) return <FontAwesomeIcon icon={faCircleCheck} color="#2ecc71" />;

      return <FontAwesomeIcon icon={faCircleXmark} color="#e74c3c" />;
    }

    return value;
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <h2 className="mb-8 flex-1 text-xl font-semibold text-white">Current usage</h2>
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th className="w-1/3">Feature</Th>
              <Th className="w-1/3">Allowed</Th>
              <Th className="w-1/3">Used</Th>
            </Tr>
          </THead>
          <TBody>
            {!isLoading &&
              data &&
              data?.rows?.length > 0 &&
              data.rows.map(({ name, allowed, used }) => {
                return (
                  <Tr key={`current-plan-row-${name}`} className="h-12">
                    <Td>{name}</Td>
                    <Td>{displayCell(allowed)}</Td>
                    <Td>{used}</Td>
                  </Tr>
                );
              })}
            {isLoading && <TableSkeleton columns={5} innerKey="invoices" />}
            {!isLoading && data && data?.rows?.length === 0 && (
              <Tr>
                <Td colSpan={3}>
                  <EmptyState title="No plan details found" icon={faFileInvoice} />
                </Td>
              </Tr>
            )}
          </TBody>
        </Table>
      </TableContainer>
    </div>
  );
};
