import { Fragment } from "react";
import { faFile } from "@fortawesome/free-solid-svg-icons";
import { twMerge } from "tailwind-merge";

import {
  Button,
  EmptyState,
  Spinner,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { Timezone } from "@app/helpers/datetime";
import { AuditLog } from "@app/hooks/api/auditLogs/types";

import { BridgeRequestsTableRow } from "./BridgeRequestsTableRow";

type Props = {
  bridgeRequests: AuditLog[];
  isLoading?: boolean;
  timezone: Timezone;
};

export const BridgeRequestsTable = ({ bridgeRequests, isLoading, timezone }: Props) => {
  const isEmpty = !isLoading && !bridgeRequests?.length;

  return (
    <div className="mb-4 w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">Session Log</h3>
      </div>

      <div className="py-4">
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th className="w-24">
                  <Spinner size="xs" className={twMerge(isLoading ? "opacity-100" : "opacity-0")} />
                </Th>
                <Th className="w-64">Timestamp</Th>
                <Th>Request Details</Th>
              </Tr>
            </THead>
            <TBody>
              {!isLoading &&
                bridgeRequests?.map((request, index) => (
                  <BridgeRequestsTableRow
                    rowNumber={index + 1}
                    request={request}
                    key={`bridge-request-${request.id}`}
                    timezone={timezone}
                  />
                ))}
              {isLoading && (
                <TableSkeleton
                  innerKey="bridge-requests-table"
                  columns={3}
                  key="requests-loading"
                />
              )}
              {isEmpty && (
                <Tr>
                  <Td colSpan={3}>
                    <EmptyState title="No bridge requests on file" icon={faFile} />
                  </Td>
                </Tr>
              )}
            </TBody>
          </Table>
        </TableContainer>
      </div>
    </div>
  );
};
