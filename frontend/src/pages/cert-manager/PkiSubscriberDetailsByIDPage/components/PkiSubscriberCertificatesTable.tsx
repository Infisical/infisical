import { useMemo, useState } from "react";
import { subject } from "@casl/ability";
import { format } from "date-fns";
import { MoreHorizontalIcon, ScrollTextIcon, Trash2Icon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  IconButton,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
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
  const { permission } = useProjectPermission();
  const { currentProject } = useProject();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PER_PAGE_INIT);

  const { data, isPending } = useGetPkiSubscriberCertificates(
    {
      subscriberName,
      projectId: currentProject.id,
      offset: (page - 1) * perPage,
      limit: perPage
    },
    {
      refetchInterval: 30_000
    }
  );

  // Fetch CA data to determine capabilities
  const { data: caData } = useListCasByProjectId();

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
      {!isPending && !data?.certificates?.length ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ScrollTextIcon />
            </EmptyMedia>
            <EmptyTitle>
              {canListPkiSubscriberCerts
                ? "No certificates have been issued for this subscriber"
                : "You do not have permission to view this subscriber's certificates"}
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Common Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Not Before</TableHead>
              <TableHead>Not After</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && <TableSkeletonRows columns={5} />}
            {!isPending &&
              data?.certificates?.map((certificate) => {
                return (
                  <TableRow key={`certificate-${certificate.id}`}>
                    <TableCell>{certificate.commonName}</TableCell>
                    <TableCell>
                      {getCertStatusBadge(certificate.status, certificate.notAfter)}
                    </TableCell>
                    <TableCell>
                      {certificate.notBefore
                        ? format(new Date(certificate.notBefore), "yyyy-MM-dd")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {certificate.notAfter
                        ? format(new Date(certificate.notAfter), "yyyy-MM-dd")
                        : "-"}
                    </TableCell>
                    <TableCell variant="action">
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
                            <Tooltip hoverable delayDuration={50}>
                              <TooltipTrigger asChild>
                                <DropdownMenuTrigger asChild>
                                  <IconButton aria-label="More options" variant="ghost" size="xs">
                                    <MoreHorizontalIcon />
                                  </IconButton>
                                </DropdownMenuTrigger>
                              </TooltipTrigger>
                              <TooltipContent>More options</TooltipContent>
                            </Tooltip>
                            <DropdownMenuContent align="start">
                              <ProjectPermissionCan
                                I={ProjectPermissionPkiSubscriberActions.Delete}
                                a={ProjectPermissionSub.PkiSubscribers}
                              >
                                {(isAllowed) => (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handlePopUpOpen &&
                                      handlePopUpOpen("revokeCertificate", {
                                        certificateId: certificate.id
                                      })
                                    }
                                    isDisabled={!isAllowed}
                                  >
                                    <Trash2Icon />
                                    Revoke Certificate
                                  </DropdownMenuItem>
                                )}
                              </ProjectPermissionCan>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        );
                      })()}
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      )}
      {!isPending && data?.totalCount !== undefined && data.totalCount >= PER_PAGE_INIT && (
        <Pagination
          count={data.totalCount}
          page={page}
          perPage={perPage}
          onChangePage={(newPage) => setPage(newPage)}
          onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
        />
      )}
    </div>
  );
};
