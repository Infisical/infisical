import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";

import {
  Badge,
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
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { CaStatus } from "@app/hooks/api/ca/enums";
import { CertStatus } from "@app/hooks/api/certificates/enums";
import { useListHsmConnectorLinkedResources } from "@app/hooks/api/hsmConnectors";

type Props = { connectorId: string };

export const HsmConnectorLinkedCertsSection = ({ connectorId }: Props) => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const { data, isPending } = useListHsmConnectorLinkedResources(connectorId, {
    offset: (page - 1) * perPage,
    limit: perPage
  });
  const linked = data?.certificates ?? [];
  const linkedCas = data?.certificateAuthorities ?? [];
  const totalCount = data?.totalCount ?? 0;
  const navigate = useNavigate();
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setPage(1);
  };

  const openCert = (certificateId: string) => {
    if (!currentProject?.id || !currentOrg?.id) return;
    navigate({
      to: "/organizations/$orgId/projects/cert-manager/$projectId/certificates/$certificateId",
      params: { orgId: currentOrg.id, projectId: currentProject.id, certificateId },
      search: { fromHsmConnector: connectorId }
    });
  };

  return (
    <Card className="w-full">
      <CardHeader className="border-b">
        <CardTitle>Linked resources</CardTitle>
        <CardDescription>
          Certificates and certificate authorities that use this HSM Connector as their key source.
          Delete is blocked while any of these exist. Re-issue or retire the certificates, and
          delete or migrate the certificate authorities first.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isPending && <Skeleton className="h-24" />}
        {!isPending && linked.length === 0 && linkedCas.length === 0 && (
          <Empty className="border border-solid">
            <EmptyHeader>
              <EmptyTitle>No linked resources</EmptyTitle>
              <EmptyDescription>
                No certificate or certificate authority currently uses this connector. It is safe to
                delete.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {!isPending && linkedCas.length > 0 && (
          <div className="mb-6">
            <p className="mb-2 text-sm font-medium text-mineshaft-200">Certificate authorities</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>HSM key label</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linkedCas.map((ca) => (
                  <TableRow key={ca.id}>
                    <TableCell className="font-medium">{ca.name}</TableCell>
                    <TableCell className="capitalize">{ca.type}</TableCell>
                    <TableCell>
                      <Badge variant={ca.status === CaStatus.ACTIVE ? "success" : "outline"}>
                        {ca.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[14rem] font-mono text-xs">
                      {ca.hsmKeyLabel ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="block truncate">{ca.hsmKeyLabel}</span>
                          </TooltipTrigger>
                          <TooltipContent>{ca.hsmKeyLabel}</TooltipContent>
                        </Tooltip>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {!isPending && linked.length > 0 && (
          <>
            {linkedCas.length > 0 && (
              <p className="mb-2 text-sm font-medium text-mineshaft-200">Certificates</p>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Common name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>HSM key label</TableHead>
                  <TableHead>Expires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linked.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-mineshaft-700"
                    onClick={() => openCert(c.id)}
                  >
                    <TableCell className="font-medium">{c.commonName}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === CertStatus.ACTIVE ? "success" : "outline"}>
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[14rem] font-mono text-xs">
                      {c.hsmKeyLabel ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="block truncate">{c.hsmKeyLabel}</span>
                          </TooltipTrigger>
                          <TooltipContent>{c.hsmKeyLabel}</TooltipContent>
                        </Tooltip>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      {c.notAfter ? format(new Date(c.notAfter), "MMM d, yyyy") : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination
              count={totalCount}
              page={page}
              perPage={perPage}
              onChangePage={setPage}
              onChangePerPage={handlePerPageChange}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
};
