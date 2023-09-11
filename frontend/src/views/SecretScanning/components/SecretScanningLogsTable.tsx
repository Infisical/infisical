import { FC, useEffect, useState } from "react";
import { faCheck, faFilterCircleXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Button,
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

import { DownloadSecretScanningTable } from "./DownloadSecretScanningTable";
import { RiskStatusSelection } from "./RiskStatusSelection";

enum RiskStatusFilter {
  ALL = "All",
  NEEDS_ATTENTION = "Needs Attention",
  RESOLVED = "Resolved",
}

export const SecretScanningLogsTable: FC = () => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [gitRisks, setGitRisks] = useState<GitRisks[]>([]);
  const [secretTypeOptions, setSecretTypeOptions] = useState<string[]>([]);
  const [repositoryOptions, setRepositoryOptions] = useState<string[]>([]);
  const [authorOptions, setAuthorOptions] = useState<string[]>([]);
  const [secretTypeFilter, setSecretTypeFilter] = useState<string>();
  const [repositoryFilter, setRepositoryFilter] = useState<string>();
  const [authorFilter, setAuthorFilter] = useState<string>();
  const [statusFilter, setStatusFilter] = useState<RiskStatusFilter>(RiskStatusFilter.ALL);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const fetchRisks = async () => {
      setIsLoading(true);
      const risks = await getRisksByOrganization(String(localStorage.getItem("orgData.id")));
      setGitRisks(risks);

      const repositoryNames = Array.from(new Set(risks.map((risk) => risk.repositoryFullName)));
      const authorNames = Array.from(new Set(risks.map((risk) => risk.author)));
      const secretTypes = Array.from(new Set(risks.map((risk) => risk.ruleID)));

      setRepositoryOptions(repositoryNames);
      setAuthorOptions(authorNames);
      setSecretTypeOptions(secretTypes);

      setIsLoading(false);
    };

    fetchRisks();
  }, []);

  const generateRiskStatusConfig = () => {
    const config = {} as Record<RiskStatus, { filterCategory: RiskStatusFilter; label: RiskStatusFilter }>;
    config[RiskStatus.UNRESOLVED] = { filterCategory: RiskStatusFilter.NEEDS_ATTENTION, label: RiskStatusFilter.NEEDS_ATTENTION };
    [RiskStatus.RESOLVED_FALSE_POSITIVE, RiskStatus.RESOLVED_NOT_REVOKED, RiskStatus.RESOLVED_REVOKED].forEach(status => {
      config[status] = { filterCategory: RiskStatusFilter.RESOLVED, label: RiskStatusFilter.RESOLVED };
    });
    return config;
  };

  const riskStatusConfig = generateRiskStatusConfig();

  const filteredRisks = gitRisks.filter((risk) => {
    const selectedFilterCategory = riskStatusConfig[risk.status]?.filterCategory;
    
    if (selectedFilterCategory && statusFilter !== RiskStatusFilter.ALL) {
      if (selectedFilterCategory !== statusFilter) {
        return false;
      }
    }

    if (repositoryFilter && risk.repositoryFullName) {
      if (!risk.repositoryFullName.includes(repositoryFilter)) {
        return false;
      }
    }

    if (authorFilter && risk.author) {
      if (!risk.author.includes(authorFilter)) {
        return false;
      }
    }

    if (secretTypeFilter && risk.ruleID) {
      if (!risk.ruleID.includes(secretTypeFilter)) {
        return false;
      }
    }

    return true;
  });

  const handleClearFilters = () => {
    setStatusFilter(RiskStatusFilter.ALL);
    setRepositoryFilter("");
    setAuthorFilter("");
    setSecretTypeFilter("");
  };

  const sortByDateFound = (a: GitRisks, b: GitRisks) => {
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();

    if (sortOrder === "asc") {
      return dateA - dateB;
    } 
      return dateB - dateA;
    
  };

  const toggleSortOrder = () => {
    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
  };

  return (
    <>
      <div className="flex justify-between items-center">
        <div className="flex items-center">
          <div className="mb-4 mr-4">
            {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
            <label htmlFor="secretTypeSelect" className="w-40 mr-4">Secret Type</label>
            <select
              id="secretTypeSelect"
              onChange={(e) => setSecretTypeFilter(e.target.value)}
              value={secretTypeFilter}
              className="block w-full py-2 px-3 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All</option>
              {secretTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-4 mr-4">
            {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
            <label htmlFor="sourceSelect" className="w-40 mr-4">Source (Repository)</label>
            <select
              id="sourceSelect"
              onChange={(e) => setRepositoryFilter(e.target.value)}
              value={repositoryFilter}
              className="block w-full py-2 px-3 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All</option>
              {repositoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-4 mr-4">
            {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
            <label htmlFor="authorSelect" className="w-40 mr-4">Author</label>
            <select
              id="authorSelect"
              onChange={(e) => setAuthorFilter(e.target.value)}
              value={authorFilter}
              className="block w-full py-2 px-3 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All</option>
              {authorOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-4 mr-4">
            {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
            <label htmlFor="riskStatusSelect" className="w-40 mr-4">Risk Status</label>
            <select
              id="riskStatusSelect"
              onChange={(e) => setStatusFilter(e.target.value as RiskStatusFilter)}
              value={statusFilter}
              className="block w-full py-2 px-3 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              {Object.values(RiskStatusFilter).map((filterOption) => (
                <option key={filterOption} value={filterOption}>
                  {filterOption}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="flex justify-between items-center">
        <div className="flex items-center">
          <div className="mb-4 mr-4">
            <DownloadSecretScanningTable filteredRisks={filteredRisks}/>
          </div>
          <div className="mb-4 mr-4">
            <Button
              isLoading={false}
              colorSchema="primary"
              variant="outline_bg"
              type="button"
              leftIcon={<FontAwesomeIcon icon={faFilterCircleXmark} className="mr-2" />}
              onClick={handleClearFilters}
            >
              Clear filters
            </Button>
          </div>
        </div>
      </div>
      <TableContainer className="mt-8">
        <Table>
          <THead>
            <Tr>
              <Th
                className="flex-1"
                onClick={() => toggleSortOrder()}
              >
                Date (Found) {(sortOrder === "asc" ? "↑" : "↓")}
              </Th>
              <Th className="flex-1">Secret Type</Th>
              <Th className="flex-1">View Risk</Th>
              <Th className="flex-1">Info</Th>
              <Th className="flex-1">Status</Th>
              <Th className="flex-1">Action</Th>
            </Tr>
          </THead>
          <TBody>
            {!isLoading &&
              filteredRisks &&
              filteredRisks
                .slice()
                .sort(sortByDateFound)
                .map((risk) => {
                const riskStatusInfo = riskStatusConfig[risk.status] || {};
                return (
                  <Tr key={risk._id} className="h-10">
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
                    <Td>
                      {riskStatusInfo.label}
                    </Td>
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
            {!isLoading && filteredRisks && filteredRisks?.length === 0 && (
              <Tr>
                <Td colSpan={7}>
                  <EmptyState title="No risks detected." icon={faCheck} />
                </Td>
              </Tr>
            )}
          </TBody>
        </Table>
      </TableContainer>
    </>
  );
};