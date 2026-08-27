import { type ReactNode, useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { PageHeader } from "@app/components/v2";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TBadgeProps
} from "@app/components/v3";
import { useGetCmekById, useGetKeyVersionsByKmsId } from "@app/hooks/api/cmeks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { KEY_VERSIONS_ROUTE_ID } from "./routeId";

const getActiveMarker = (version: number, currentVersion?: number) => {
  if (currentVersion === undefined) return { label: "Unavailable", variant: "neutral" };
  if (currentVersion === 0) return { label: "Pending Import", variant: "neutral" };
  if (version === currentVersion) return { label: "Active", variant: "success" };
  if (version < currentVersion) return { label: "Archived", variant: "neutral" };
  return { label: "Upcoming", variant: "info" };
};

const formatDateTime = (date?: string) => {
  if (!date) return "—";

  const timestamp = new Date(date);
  return `${timestamp.toLocaleDateString()} ${timestamp.toLocaleTimeString()}`;
};

export const KeyVersionsPage = () => {
  const navigate = useNavigate();
  const { orgId, projectId, keyId } = useParams({ from: KEY_VERSIONS_ROUTE_ID });
  const { keyName, algorithm } = useSearch({ from: KEY_VERSIONS_ROUTE_ID });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const {
    data,
    isPending,
    isFetching: isVersionsFetching,
    isError: isVersionsError,
    refetch: refetchVersions
  } = useGetKeyVersionsByKmsId({
    keyId,
    offset: (page - 1) * perPage,
    limit: perPage,
    orderDirection: OrderByDirection.DESC
  });
  const {
    data: cmekData,
    isPending: isCmekPending,
    isFetching: isCmekFetching,
    isError: isCmekError,
    refetch: refetchCmek
  } = useGetCmekById(keyId);

  const versions = data?.versions ?? [];
  const currentVersion = cmekData?.key.version;
  const totalCount = data?.totalCount ?? 0;
  let content: ReactNode;

  if (isPending || isVersionsFetching || isCmekPending || isCmekFetching) {
    content = (
      <Table>
        <TableHeader>
          <TableRow>
            {Array.from({ length: 4 }).map((_, index) => (
              // eslint-disable-next-line react/no-array-index-key
              <TableHead key={index}>
                <Skeleton className="h-4 w-20" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 3 }).map((_, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <TableRow key={index}>
              {Array.from({ length: 4 }).map((__, cellIndex) => (
                // eslint-disable-next-line react/no-array-index-key
                <TableCell key={cellIndex}>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  } else if (isVersionsError || isCmekError) {
    content = (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Unable to load key versions</EmptyTitle>
          <EmptyDescription>
            We couldn&apos;t retrieve this key&apos;s details or versions. Please try again.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant="outline"
            onClick={async () => {
              await Promise.all([refetchVersions(), refetchCmek()]);
            }}
          >
            Retry
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else if (versions.length === 0) {
    content = (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No key versions</EmptyTitle>
          <EmptyDescription>This key does not have any material versions yet.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    content = (
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/5">Version</TableHead>
            <TableHead className="w-[35%]">Active Marker</TableHead>
            <TableHead className="w-1/5">Origin</TableHead>
            <TableHead className="w-1/4">Created At</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {versions.map((keyVersion) => {
            const marker = getActiveMarker(keyVersion.version, currentVersion);
            return (
              <TableRow key={keyVersion.id}>
                <TableCell>{keyVersion.version}</TableCell>
                <TableCell>
                  <Badge variant={marker.variant as TBadgeProps["variant"]}>{marker.label}</Badge>
                </TableCell>
                <TableCell className="capitalize">{keyVersion.origin}</TableCell>
                <TableCell>{formatDateTime(keyVersion.createdAt)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="h-full bg-bunker-800">
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <Button
          className="mb-4"
          variant="ghost"
          onClick={() =>
            navigate({
              to: "/organizations/$orgId/projects/kms/$projectId/overview",
              params: { orgId, projectId }
            })
          }
        >
          Back to Keys
        </Button>
        <PageHeader
          scope={ProjectType.KMS}
          title={keyName ?? "Key Versions"}
          description={algorithm ? `Algorithm: ${algorithm}` : "View versions of this keypair."}
        />
        <Card>
          <CardHeader>
            <CardTitle>Key Versions</CardTitle>
            <CardDescription>View versions of this Encrypt/Decrypt keypair.</CardDescription>
          </CardHeader>
          <CardContent>
            {content}
            {totalCount > 0 && (
              <Pagination
                count={totalCount}
                page={page}
                perPage={perPage}
                onChangePage={setPage}
                onChangePerPage={setPerPage}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
