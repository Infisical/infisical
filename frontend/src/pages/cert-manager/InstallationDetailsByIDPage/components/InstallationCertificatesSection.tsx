/* eslint-disable no-nested-ternary */
import { useNavigate, useParams } from "@tanstack/react-router";
import { format } from "date-fns";

import { truncateSerialNumber } from "@app/components/utilities/serialNumberUtils";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { TPkiInstallationCert } from "@app/hooks/api";

import { getCertValidUntilBadgeDetails } from "../../CertificatesPage/components/CertificatesTable.utils";

type Props = {
  certificates: TPkiInstallationCert[];
};

export const InstallationCertificatesSection = ({ certificates }: Props) => {
  const navigate = useNavigate();
  const { orgId, projectId } = useParams({
    from: "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/discovery/installations/$installationId"
  });

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Discovered Certificates</CardTitle>
        <CardDescription>Certificates found on this installation</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {certificates.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No certificates found on this installation</EmptyTitle>
              <EmptyDescription>Run a scan to discover certificates</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SAN / CN</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Serial Number</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Last Seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {certificates.map((cert) => {
                const expiryDetails = cert.notAfter
                  ? getCertValidUntilBadgeDetails(cert.notAfter)
                  : null;

                return (
                  <TableRow
                    key={cert.id}
                    onClick={() =>
                      navigate({
                        to: "/organizations/$orgId/projects/cert-manager/$projectId/certificates/$certificateId",
                        params: {
                          orgId,
                          projectId,
                          certificateId: cert.certificateId
                        }
                      })
                    }
                  >
                    <TableCell>{cert.commonName || "N/A"}</TableCell>
                    <TableCell>
                      {expiryDetails ? (
                        <Badge variant={expiryDetails.variant}>{expiryDetails.label}</Badge>
                      ) : (
                        <Badge variant="neutral">Unknown</Badge>
                      )}
                    </TableCell>
                    <TableCell isTruncatable>
                      {truncateSerialNumber(cert.serialNumber || "")}
                    </TableCell>
                    <TableCell>
                      {cert.notAfter ? format(new Date(cert.notAfter), "MMM dd, yyyy") : "-"}
                    </TableCell>
                    <TableCell>
                      {cert.lastSeenAt
                        ? format(new Date(cert.lastSeenAt), "MMM dd, yyyy HH:mm")
                        : "-"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
