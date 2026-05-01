import { useState } from "react";
import { faSyncAlt } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { Lottie, Tooltip } from "@app/components/v2";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
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
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Scan Runs</CardTitle>
            <CardDescription>History of scan executions</CardDescription>
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
      </CardHeader>
      <CardContent className="p-0">
        {isPending && (
          <div className="flex h-40 w-full items-center justify-center">
            <Lottie icon="infisical_loading_white" isAutoPlay className="w-16" />
          </div>
        )}
        {!isPending && scans.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No scan history</EmptyTitle>
              <EmptyDescription>Trigger a scan to see scan history</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {!isPending && scans.length > 0 && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Targets</TableHead>
                  <TableHead>Certs Found</TableHead>
                  <TableHead>Installations</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
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
                    <TableRow key={scan.id}>
                      <TableCell>
                        {format(new Date(scan.startedAt), "MMM dd, yyyy HH:mm:ss")}
                      </TableCell>
                      <TableCell>{getScanStatusBadge(scan.status)}</TableCell>
                      <TableCell>{scan.targetsScannedCount}</TableCell>
                      <TableCell>{scan.certificatesFoundCount}</TableCell>
                      <TableCell>{scan.installationsFoundCount}</TableCell>
                      <TableCell>{duration !== null ? `${duration}s` : "-"}</TableCell>
                      <TableCell>
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
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {Boolean(totalCount) && (
              <Pagination
                count={totalCount}
                page={page}
                perPage={perPage}
                onChangePage={setPage}
                onChangePerPage={setPerPage}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
