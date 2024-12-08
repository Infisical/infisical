import { useRouter } from "next/router";
import { faBan, faCertificate, faEllipsis, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
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
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { SshCaStatus , useListOrgSshCas } from "@app/hooks/api";
import { caStatusToNameMap, getCaStatusBadgeVariant } from "@app/hooks/api/ca/constants";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteSshCa", "sshCaStatus"]>,
    data?: {}
  ) => void;
};

export const SshCaTable = ({ handlePopUpOpen }: Props) => {
  const router = useRouter();
  const { currentOrg } = useOrganization();
  const { data, isLoading } = useListOrgSshCas({
    orgId: currentOrg?.id ?? ""
  });

  return (
    <div>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>Friendly Name</Th>
              <Th>Status</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {isLoading && <TableSkeleton columns={3} innerKey="org-ssh-cas" />}
            {!isLoading &&
              data &&
              data.length > 0 &&
              data.map((ca) => {
                return (
                  <Tr
                    className="h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
                    key={`ca-${ca.id}`}
                    onClick={() => router.push(`/org/${currentOrg?.id}/ssh/ca/${ca.id}`)}
                  >
                    <Td>{ca.friendlyName}</Td>
                    <Td>
                      <Badge variant={getCaStatusBadgeVariant(ca.status)}>
                        {caStatusToNameMap[ca.status]}
                      </Badge>
                    </Td>
                    <Td className="flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild className="rounded-lg">
                          <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                            <Tooltip content="More options">
                              <FontAwesomeIcon size="lg" icon={faEllipsis} />
                            </Tooltip>
                          </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="p-1">
                          {(ca.status === SshCaStatus.ACTIVE ||
                            ca.status === SshCaStatus.DISABLED) && (
                            <OrgPermissionCan
                              I={OrgPermissionActions.Edit}
                              a={OrgPermissionSubjects.SshCertificateAuthorities}
                            >
                              {(isAllowed) => (
                                <DropdownMenuItem
                                  className={twMerge(
                                    !isAllowed &&
                                      "pointer-events-none cursor-not-allowed opacity-50"
                                  )}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePopUpOpen("sshCaStatus", {
                                      caId: ca.id,
                                      status:
                                        ca.status === SshCaStatus.ACTIVE
                                          ? SshCaStatus.DISABLED
                                          : SshCaStatus.ACTIVE
                                    });
                                  }}
                                  disabled={!isAllowed}
                                  icon={<FontAwesomeIcon icon={faBan} />}
                                >
                                  {`${
                                    ca.status === SshCaStatus.ACTIVE ? "Disable" : "Enable"
                                  } SSH CA`}
                                </DropdownMenuItem>
                              )}
                            </OrgPermissionCan>
                          )}
                          <OrgPermissionCan
                            I={OrgPermissionActions.Delete}
                            a={OrgPermissionSubjects.SshCertificateAuthorities}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("deleteSshCa", {
                                    caId: ca.id
                                  });
                                }}
                                disabled={!isAllowed}
                                icon={<FontAwesomeIcon icon={faTrash} />}
                              >
                                Delete SSH CA
                              </DropdownMenuItem>
                            )}
                          </OrgPermissionCan>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </Td>
                  </Tr>
                );
              })}
          </TBody>
        </Table>
        {!isLoading && data?.length === 0 && (
          <EmptyState
            title="No SSH certificate authorities have been created"
            icon={faCertificate}
          />
        )}
      </TableContainer>
    </div>
  );
};
