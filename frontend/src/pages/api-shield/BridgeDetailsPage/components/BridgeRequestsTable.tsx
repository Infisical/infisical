import { Fragment } from "react";
import { faFile, faMagicWandSparkles } from "@fortawesome/free-solid-svg-icons";
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
import { BridgeRequestLog } from "@app/hooks/api/auditLogs/types";

import { BridgeRequestsTableRow } from "./BridgeRequestsTableRow";
import { ReactChart } from "./RequestChart";
import { TBridge } from "@app/hooks/api/bridge";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import ReactMarkdown from "react-markdown";

type Props = {
  bridgeRequests: BridgeRequestLog[];
  isLoading?: boolean;
  timezone: Timezone;
  bridgeDetails?: TBridge;
};

export const BridgeRequestsTable = ({
  bridgeRequests,
  isLoading,
  timezone,
  bridgeDetails
}: Props) => {
  const isEmpty = !isLoading && !bridgeRequests?.length;

  return (
    <div className="mb-4 w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">Request Logs</h3>
      </div>
      {!isEmpty && (
        <div className="mt-6 h-[300px] w-full">
          <ReactChart logs={bridgeRequests} />
        </div>
      )}
      {bridgeDetails?.dailyInsightText && (
        <div className="flex flex-col gap-1 rounded border border-yellow-600 bg-yellow-900/20 px-3 py-2">
          <div className="flex items-center gap-1.5 font-medium">
            <FontAwesomeIcon icon={faMagicWandSparkles} className="text-yellow-400" />
            <span>AI Log Insight</span>
          </div>
          <span className="whitespace-pre-wrap text-sm text-yellow-200">
            <ReactMarkdown>{bridgeDetails.dailyInsightText}</ReactMarkdown>
          </span>
        </div>
      )}
      <div className="py-4">
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th className="w-24">
                  <Spinner size="xs" className={twMerge(isLoading ? "opacity-100" : "opacity-0")} />
                </Th>
                <Th className="w-42">Timestamp</Th>
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
