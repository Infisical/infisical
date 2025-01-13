import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { formatDistance } from "date-fns";

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
import { TSecretScanningGitRisks } from "@app/hooks/api/secretScanning/types";

import { RiskStatusSelection } from "./RiskStatusSelection";

type Props = {
  gitRisks?: TSecretScanningGitRisks[];
  isPending: boolean;
};

export const SecretScanningLogsTable = ({ gitRisks, isPending }: Props) => {
  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th className="flex-1">Date</Th>
            <Th className="flex-1">Secret Type</Th>
            <Th className="flex-1">View Risk</Th>
            <Th className="flex-1">Info</Th>
            <Th className="flex-1">Status</Th>
            <Th className="flex-1">Action</Th>
            <Th className="w-5" />
          </Tr>
        </THead>
        <TBody>
          {!isPending &&
            gitRisks &&
            gitRisks?.map((risk) => {
              return (
                <Tr key={risk.ruleID} className="h-10">
                  <Td>{formatDistance(new Date(risk.createdAt), new Date())}</Td>
                  <Td>{risk.ruleID}</Td>
                  <Td>
                    <a
                      href={`https://github.com/${risk.repositoryFullName}/blob/${risk.commit}/${risk.file}#L${risk.startLine}-L${risk.endLine}`}
                      target="_blank"
                      className="text-red-500"
                      rel="noreferrer"
                    >
                      View Exposed Secret
                    </a>
                  </Td>
                  <Td>
                    <div className="font-bold">
                      <a href={`https://github.com/${risk.repositoryFullName}`}>
                        {risk.repositoryFullName}
                      </a>
                    </div>
                    <div className="text-xs">
                      <span>{risk.file}</span>
                      <br />
                      <br />
                      <span className="font-bold">{risk.author}</span>
                      <br />
                      <span>{risk.email}</span>
                    </div>
                  </Td>
                  <Td>{risk.isResolved ? "Resolved" : "Needs Attention"}</Td>
                  <Td>
                    <RiskStatusSelection riskId={risk.id} currentSelection={risk.status} />
                  </Td>
                </Tr>
              );
            })}
          {isPending && <TableSkeleton columns={7} innerKey="gitRisks" />}
          {!isPending && gitRisks && gitRisks?.length === 0 && (
            <Tr>
              <Td colSpan={7}>
                <EmptyState title="No risks detected." icon={faCheck} />
              </Td>
            </Tr>
          )}
        </TBody>
      </Table>
    </TableContainer>
  );
};
