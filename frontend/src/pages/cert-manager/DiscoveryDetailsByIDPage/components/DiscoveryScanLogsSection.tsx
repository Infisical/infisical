import { useState } from "react";
import { faSyncAlt } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { Lottie, Tooltip } from "@app/components/v2";
import {
  Button,
  UnstableCard,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableEmpty,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstablePagination,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { useGetScanHistory } from "@app/hooks/api";
import { getScanStatusBadge } from "@app/pages/cert-manager/pki-discovery-utils";

type Props = {
  discoveryId: string;
  onTriggerScan: () => void;
  isTriggerDisabled: boolean;
  isTriggerPending: boolean;
};

const PER_PAGE_INIT = 10;

export const DiscoveryScanLogsSection = ({
  discoveryId,
  onTriggerScan,
  isTriggerDisabled,
  isTriggerPending
}: Props) => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PER_PAGE_INIT);

  const { data, isPending } = useGetScanHistory({
    discoveryId,
    offset: (page - 1) * perPage,
    limit: perPage
  });

  const scans = data?.scans || [];
  const totalCount = data?.totalCount || 0;

  return (
    <UnstableCard>
      <UnstableCardHeader className="border-b">
        <div className="flex items-center justify-between">
          <div>
            <UnstableCardTitle>Scan Runs</UnstableCardTitle>
            <UnstableCardDescription>History of scan executions</UnstableCardDescription>
          </div>
          <Button
            variant="outline"
            size="xs"
            onClick={onTriggerScan}
            isDisabled={isTriggerDisabled}
            isPending={isTriggerPending}
          >
            <FontAwesomeIcon icon={faSyncAlt} className="mr-1" />
            Trigger Scan
          </Button>
        </div>
      </UnstableCardHeader>
      <UnstableCardContent className="p-0">
        {isPending && (
          <div className="flex h-40 w-full items-center justify-center">
            <Lottie icon="infisical_loading_white" isAutoPlay className="w-16" />
          </div>
        )}
        {!isPending && scans.length === 0 && (
          <UnstableEmpty>
            <UnstableEmptyHeader>
              <UnstableEmptyTitle>No scan history</UnstableEmptyTitle>
              <UnstableEmptyDescription>
                Trigger a scan to see scan history
              </UnstableEmptyDescription>
            </UnstableEmptyHeader>
          </UnstableEmpty>
        )}
        {!isPending && scans.length > 0 && (
          <>
            <UnstableTable>
              <UnstableTableHeader>
                <UnstableTableRow>
                  <UnstableTableHead>Started</UnstableTableHead>
                  <UnstableTableHead>Status</UnstableTableHead>
                  <UnstableTableHead>Targets</UnstableTableHead>
                  <UnstableTableHead>Certs Found</UnstableTableHead>
                  <UnstableTableHead>Installations</UnstableTableHead>
                  <UnstableTableHead>Duration</UnstableTableHead>
                  <UnstableTableHead>Message</UnstableTableHead>
                </UnstableTableRow>
              </UnstableTableHeader>
              <UnstableTableBody>
                {scans.map((scan) => {
                  const duration =
                    scan.completedAt && scan.startedAt
                      ? Math.round(
                          (new Date(scan.completedAt).getTime() -
                            new Date(scan.startedAt).getTime()) /
                            1000
                        )
                      : null;

                  return (
                    <UnstableTableRow key={scan.id}>
                      <UnstableTableCell>
                        {format(new Date(scan.startedAt), "MMM dd, yyyy HH:mm:ss")}
                      </UnstableTableCell>
                      <UnstableTableCell>{getScanStatusBadge(scan.status)}</UnstableTableCell>
                      <UnstableTableCell>{scan.targetsScannedCount}</UnstableTableCell>
                      <UnstableTableCell>{scan.certificatesFoundCount}</UnstableTableCell>
                      <UnstableTableCell>{scan.installationsFoundCount}</UnstableTableCell>
                      <UnstableTableCell>
                        {duration !== null ? `${duration}s` : "-"}
                      </UnstableTableCell>
                      <UnstableTableCell>
                        {scan.errorMessage ? (
                          <Tooltip
                            className="max-w-sm"
                            content={
                              <div className="max-h-40 overflow-y-auto py-1 text-xs break-words whitespace-normal">
                                {scan.errorMessage}
                              </div>
                            }
                          >
                            <span className="cursor-help truncate text-yellow-500">
                              {scan.errorMessage.length > 20
                                ? `${scan.errorMessage.substring(0, 20)}...`
                                : scan.errorMessage}
                            </span>
                          </Tooltip>
                        ) : (
                          "-"
                        )}
                      </UnstableTableCell>
                    </UnstableTableRow>
                  );
                })}
              </UnstableTableBody>
            </UnstableTable>
            {Boolean(totalCount) && (
              <UnstablePagination
                count={totalCount}
                page={page}
                perPage={perPage}
                onChangePage={setPage}
                onChangePerPage={setPerPage}
              />
            )}
          </>
        )}
      </UnstableCardContent>
    </UnstableCard>
  );
};
