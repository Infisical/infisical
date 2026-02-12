/* eslint-disable no-nested-ternary */
import { useNavigate, useParams } from "@tanstack/react-router";
import { format } from "date-fns";

import { truncateSerialNumber } from "@app/components/utilities/serialNumberUtils";
import {
  Badge,
  UnstableCard,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableEmpty,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
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
    <UnstableCard>
      <UnstableCardHeader className="border-b">
        <UnstableCardTitle>Discovered Certificates</UnstableCardTitle>
        <UnstableCardDescription>Certificates found on this installation</UnstableCardDescription>
      </UnstableCardHeader>
      <UnstableCardContent className="p-0">
        {certificates.length === 0 ? (
          <UnstableEmpty>
            <UnstableEmptyHeader>
              <UnstableEmptyTitle>No certificates found on this installation</UnstableEmptyTitle>
              <UnstableEmptyDescription>
                Run a scan to discover certificates
              </UnstableEmptyDescription>
            </UnstableEmptyHeader>
          </UnstableEmpty>
        ) : (
          <UnstableTable>
            <UnstableTableHeader>
              <UnstableTableRow>
                <UnstableTableHead>SAN / CN</UnstableTableHead>
                <UnstableTableHead>Status</UnstableTableHead>
                <UnstableTableHead>Serial Number</UnstableTableHead>
                <UnstableTableHead>Expires</UnstableTableHead>
                <UnstableTableHead>Last Seen</UnstableTableHead>
              </UnstableTableRow>
            </UnstableTableHeader>
            <UnstableTableBody>
              {certificates.map((cert) => {
                const expiryDetails = cert.notAfter
                  ? getCertValidUntilBadgeDetails(cert.notAfter)
                  : null;

                return (
                  <UnstableTableRow
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
                    <UnstableTableCell>{cert.commonName || "N/A"}</UnstableTableCell>
                    <UnstableTableCell>
                      {expiryDetails ? (
                        <Badge variant={expiryDetails.variant}>{expiryDetails.label}</Badge>
                      ) : (
                        <Badge variant="neutral">Unknown</Badge>
                      )}
                    </UnstableTableCell>
                    <UnstableTableCell isTruncatable>
                      {truncateSerialNumber(cert.serialNumber || "")}
                    </UnstableTableCell>
                    <UnstableTableCell>
                      {cert.notAfter ? format(new Date(cert.notAfter), "MMM dd, yyyy") : "-"}
                    </UnstableTableCell>
                    <UnstableTableCell>
                      {cert.lastSeenAt
                        ? format(new Date(cert.lastSeenAt), "MMM dd, yyyy HH:mm")
                        : "-"}
                    </UnstableTableCell>
                  </UnstableTableRow>
                );
              })}
            </UnstableTableBody>
          </UnstableTable>
        )}
      </UnstableCardContent>
    </UnstableCard>
  );
};
