import { useMemo, useState } from "react";
import { subject } from "@casl/ability";
import { faCertificate, faEllipsis, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Pagination,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import { Badge } from "@app/components/v3";
import {
  ProjectPermissionPkiSubscriberActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import { useGetPkiSubscriberCertificates } from "@app/hooks/api";
import { caSupportsCapability } from "@app/hooks/api/ca/constants";
import { CaCapability, CaType } from "@app/hooks/api/ca/enums";
import { useListCasByProjectId } from "@app/hooks/api/ca/queries";
import { CertStatus } from "@app/hooks/api/certificates/enums";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  subscriberName: string;
  handlePopUpOpen?: (popUpName: keyof UsePopUpState<["revokeCertificate"]>, data?: object) => void;
};

const PER_PAGE_INIT = 25;

export const PkiSubscriberCertificatesTable = ({ subscriberName, handlePopUpOpen }: Props) => {
  const { currentProject } = useProject();
  const projectId = currentProject.id;
  const { permission } = useProjectPermission();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PER_PAGE_INIT);

  const { data, isPending } = useGetPkiSubscriberCertificates(
    {
      subscriberName,
      projectId,
      offset: (page - 1) * perPage,
      limit: perPage
    },
    {
      refetchInterval: 5000
    }
  );

  // Fetch CA data to determine capabilities
  const { data: caData } = useListCasByProjectId(currentProject.id);

  // Create mapping from caId to CA type for capability checking
  const caCapabilityMap = useMemo(() => {
    if (!caData) return {};

    const map: Record<string, CaType> = {};
    caData.forEach((ca) => {
      map[ca.id] = ca.type;
    });
    return map;
  }, [caData]);

  const getCertStatusBadge = (status: string, notAfter: string) => {
    if (status === CertStatus.REVOKED) {
      return <Badge variant="danger">Revoked</Badge>;
    }

    const expiryDate = new Date(notAfter);
    const now = new Date();
    const daysUntilExpiry = Math.floor(
      (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilExpiry < 0) {
      return <Badge variant="danger">Expired</Badge>;
    }

    if (daysUntilExpiry < 30) {
      return <Badge variant="warning">Expiring Soon</Badge>;
    }

    return <Badge variant="success">Valid</Badge>;
  };

  const canListPkiSubscriberCerts = permission.can(
    ProjectPermissionPkiSubscriberActions.ListCerts,
    subject(ProjectPermissionSub.PkiSubscribers, {
      name: subscriberName
    })
  );

  return (
    <div>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>Common Name</Th>
              <Th>Status</Th>
              <Th>Not Before</Th>
              <Th>Not After</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {isPending && <TableSkeleton columns={5} innerKey="pki-subscriber-certificates" />}
            {!isPending &&
              data?.certificates?.map((certificate) => {
                return (
                  <Tr className="h-10" key={`certificate-${certificate.id}`}>
                    <Td>{certificate.commonName}</Td>
                    <Td>{getCertStatusBadge(certificate.status, certificate.notAfter)}</Td>
                    <Td>
                      {certificate.notBefore
                        ? format(new Date(certificate.notBefore), "yyyy-MM-dd")
                        : "-"}
                    </Td>
                    <Td>
                      {certificate.notAfter
                        ? format(new Date(certificate.notAfter), "yyyy-MM-dd")
                        : "-"}
                    </Td>
                    <Td className="flex justify-end">
                      {(() => {
                        const caType = caCapabilityMap[certificate.caId];
                        const supportsRevocation =
                          caType && caSupportsCapability(caType, CaCapability.REVOKE_CERTIFICATES);

                        // Don't show dropdown for CAs that don't support revocation
                        if (!supportsRevocation) {
                          return null;
                        }

                        return (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild className="rounded-lg">
                              <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                                <Tooltip content="More options">
                                  <FontAwesomeIcon size="lg" icon={faEllipsis} />
                                </Tooltip>
                              </div>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="p-1">
                              <ProjectPermissionCan
                                I={ProjectPermissionPkiSubscriberActions.Delete}
                                a={ProjectPermissionSub.PkiSubscribers}
                              >
                                {(isAllowed) => (
                                  <DropdownMenuItem
                                    className={twMerge(
                                      !isAllowed &&
                                        "pointer-events-none cursor-not-allowed opacity-50"
                                    )}
                                    onClick={() =>
                                      handlePopUpOpen &&
                                      handlePopUpOpen("revokeCertificate", {
                                        certificateId: certificate.id
                                      })
                                    }
                                    disabled={!isAllowed}
                                    icon={<FontAwesomeIcon icon={faTrash} />}
                                  >
                                    Revoke Certificate
                                  </DropdownMenuItem>
                                )}
                              </ProjectPermissionCan>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        );
                      })()}
                    </Td>
                  </Tr>
                );
              })}
          </TBody>
        </Table>
        {!isPending && data?.totalCount !== undefined && data.totalCount >= PER_PAGE_INIT && (
          <Pagination
            count={data.totalCount}
            page={page}
            perPage={perPage}
            onChangePage={(newPage) => setPage(newPage)}
            onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
          />
        )}
        {!isPending && !data?.certificates?.length && (
          <EmptyState
            title={`${canListPkiSubscriberCerts ? "No certificates have been issued for this subscriber" : "You do not have permission to view this subscriber's certificates"}`}
            icon={faCertificate}
          />
        )}
      </TableContainer>
    </div>
  );
};
