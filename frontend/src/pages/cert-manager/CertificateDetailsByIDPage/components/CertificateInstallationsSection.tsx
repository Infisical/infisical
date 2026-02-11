import { useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { format } from "date-fns";

import { Lottie } from "@app/components/v2";
import {
  UnstableCard,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstablePagination,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { useGetPkiInstallationsByCertificateId } from "@app/hooks/api";
import { getEndpoint, getGatewayLabel } from "@app/pages/cert-manager/pki-discovery-utils";

type Props = {
  certificateId: string;
};

const PER_PAGE_INIT = 10;

export const CertificateInstallationsSection = ({ certificateId }: Props) => {
  const navigate = useNavigate();
  const { orgId, projectId } = useParams({
    from: "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/certificates/$certificateId"
  });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PER_PAGE_INIT);

  const { data: installations, isPending } = useGetPkiInstallationsByCertificateId(certificateId);

  if (isPending) {
    return (
      <UnstableCard>
        <UnstableCardHeader className="border-b">
          <UnstableCardTitle>Installations</UnstableCardTitle>
          <UnstableCardDescription>
            Locations where this certificate was discovered
          </UnstableCardDescription>
        </UnstableCardHeader>
        <UnstableCardContent>
          <div className="flex h-40 w-full items-center justify-center">
            <Lottie icon="infisical_loading_white" isAutoPlay className="w-16" />
          </div>
        </UnstableCardContent>
      </UnstableCard>
    );
  }

  if (!installations || installations.length === 0) {
    return null;
  }

  const totalCount = installations.length;
  const paginatedInstallations = installations.slice((page - 1) * perPage, page * perPage);

  return (
    <UnstableCard>
      <UnstableCardHeader className="border-b">
        <UnstableCardTitle>Installations</UnstableCardTitle>
        <UnstableCardDescription>
          Locations where this certificate was discovered
        </UnstableCardDescription>
      </UnstableCardHeader>
      <UnstableCardContent className="p-0">
        <UnstableTable>
          <UnstableTableHeader>
            <UnstableTableRow>
              <UnstableTableHead>Endpoint</UnstableTableHead>
              <UnstableTableHead>Gateway</UnstableTableHead>
              <UnstableTableHead>Last Seen</UnstableTableHead>
            </UnstableTableRow>
          </UnstableTableHeader>
          <UnstableTableBody>
            {paginatedInstallations.map((installation) => (
              <UnstableTableRow
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
                <UnstableTableCell>{getEndpoint(installation)}</UnstableTableCell>
                <UnstableTableCell>{getGatewayLabel(installation) || "N/A"}</UnstableTableCell>
                <UnstableTableCell>
                  {format(new Date(installation.lastSeenAt), "MMM dd, yyyy HH:mm")}
                </UnstableTableCell>
              </UnstableTableRow>
            ))}
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
      </UnstableCardContent>
    </UnstableCard>
  );
};
