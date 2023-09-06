import { FC, useEffect, useState } from "react";
import { faCheck } from "@fortawesome/free-solid-svg-icons";

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
import timeSince from "@app/ee/utilities/timeSince";
import { getRisksByOrganization } from "@app/pages/api/secret-scanning/getRisksByOrganization";
import { GitRisks, RiskStatus } from "@app/pages/api/secret-scanning/types";

import { RiskStatusSelection } from "./RiskStatusSelection";

export const SecretScanningLogsTable: FC = () => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [gitRisks, setGitRisks] = useState<GitRisks[]>([]);

  useEffect(() => {
    const fetchRisks = async () => {
      setIsLoading(true);
      const risks = await getRisksByOrganization(String(localStorage.getItem("orgData.id")));
      setGitRisks(risks);
      setIsLoading(false);
    };

    fetchRisks();
  }, []);

  return (
    <TableContainer className="mt-8">
        <Table>
          <THead>
            <Tr>
              <Th className="flex-1">Date</Th>
              <Th className="flex-1">Secret Type</Th>
              <Th className="flex-1">View Risk</Th>
              <Th className="flex-1">Info</Th>
              <Th className="flex-1">Status</Th>
            </Tr>
          </THead>
          <TBody>
            {!isLoading &&
              gitRisks &&
              gitRisks.map((risk) => {
                return (
                  <Tr key={risk.ruleID} className="h-10">
                    <Td>{timeSince(new Date(risk.createdAt))}</Td>
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
                    <Td>{risk.status === RiskStatus.UNRESOLVED ? "Needs Attention" : "Resolved"}</Td>
                    <Td>
                      <RiskStatusSelection
                        riskId={risk._id}
                        currentSelection={risk.status as RiskStatus}
                      />
                    </Td>
                  </Tr>
                );
              })}
            {isLoading && <TableSkeleton columns={7} innerKey="gitRisks" />}
            {!isLoading && gitRisks && gitRisks.length === 0 && (
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