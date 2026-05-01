import { useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { format } from "date-fns";

import { Lottie } from "@app/components/v2";
import {
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
import { useListPkiInstallations } from "@app/hooks/api";
import { getEndpoint, getGatewayLabel } from "@app/pages/cert-manager/pki-discovery-utils";

type Props = {
  discoveryId: string;
  projectId: string;
};

const PER_PAGE_INIT = 10;

export const DiscoveryInstallationsSection = ({ discoveryId, projectId }: Props) => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PER_PAGE_INIT);
  const { orgId } = useParams({
    from: "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/discovery/$discoveryId"
  });

  const { data, isPending } = useListPkiInstallations({
    projectId,
    discoveryId,
    offset: (page - 1) * perPage,
    limit: perPage
  });

  const installations = data?.installations || [];
  const totalCount = data?.totalCount || 0;

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Installations</CardTitle>
        <CardDescription>Certificate installations discovered by this job</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isPending && (
          <div className="flex h-40 w-full items-center justify-center">
            <Lottie icon="infisical_loading_white" isAutoPlay className="w-16" />
          </div>
        )}
        {!isPending && installations.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No installations found</EmptyTitle>
              <EmptyDescription>Run a scan to discover certificate installations</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {!isPending && installations.length > 0 && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Certificate</TableHead>
                  <TableHead>Gateway</TableHead>
                  <TableHead>Last Seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {installations.map((installation) => (
                  <TableRow
                    key={installation.id}
                    onClick={() =>
                      navigate({
                        to: "/organizations/$orgId/projects/cert-manager/$projectId/discovery/installations/$installationId",
                        params: {
                          orgId,
                          projectId,
                          installationId: installation.id
                        }
                      })
                    }
                  >
                    <TableCell>{getEndpoint(installation)}</TableCell>
                    <TableCell>{installation.primaryCertName || "N/A"}</TableCell>
                    <TableCell>{getGatewayLabel(installation) || "N/A"}</TableCell>
                    <TableCell>
                      {format(new Date(installation.lastSeenAt), "MMM dd, yyyy HH:mm")}
                    </TableCell>
                  </TableRow>
                ))}
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
