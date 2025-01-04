import {
  faBan,
  faCertificate,
  faEllipsis,
  faFileAlt,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
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
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { SshCertTemplateStatus, useGetSshCaCertTemplates } from "@app/hooks/api";
import { caStatusToNameMap, getCaStatusBadgeVariant } from "@app/hooks/api/ca/constants";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  sshCaId: string;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<
      [
        "sshCertificateTemplate",
        "sshCertificateTemplateStatus",
        "sshCertificate",
        "deleteSshCertificateTemplate",
        "upgradePlan"
      ]
    >,
    data?: {
      id?: string;
      name?: string;
      sshCaId?: string;
      status?: SshCertTemplateStatus;
      templateId?: string;
    }
  ) => void;
};

export const SshCertificateTemplatesTable = ({ handlePopUpOpen, sshCaId }: Props) => {
  const { data, isPending } = useGetSshCaCertTemplates(sshCaId);
  return (
    <div>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>Name</Th>
              <Th>Status</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {isPending && <TableSkeleton columns={2} innerKey="project-cas" />}
            {!isPending &&
              data?.certificateTemplates.map((certificateTemplate) => {
                return (
                  <Tr className="h-10" key={`certificate-${certificateTemplate.id}`}>
                    <Td>{certificateTemplate.name}</Td>
                    <Td>
                      <Badge variant={getCaStatusBadgeVariant(certificateTemplate.status)}>
                        {caStatusToNameMap[certificateTemplate.status]}
                      </Badge>
                    </Td>
                    <Td className="flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild className="rounded-lg">
                          <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                            <Tooltip content="More options">
                              <FontAwesomeIcon size="sm" icon={faEllipsis} />
                            </Tooltip>
                          </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="p-1">
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Edit}
                            a={ProjectPermissionSub.SshCertificateTemplates}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("sshCertificateTemplateStatus", {
                                    templateId: certificateTemplate.id,
                                    status:
                                      certificateTemplate.status === SshCertTemplateStatus.ACTIVE
                                        ? SshCertTemplateStatus.DISABLED
                                        : SshCertTemplateStatus.ACTIVE
                                  });
                                }}
                                disabled={!isAllowed}
                                icon={<FontAwesomeIcon icon={faBan} />}
                              >
                                {`${
                                  certificateTemplate.status === SshCertTemplateStatus.ACTIVE
                                    ? "Disable"
                                    : "Enable"
                                } Template`}
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Edit}
                            a={ProjectPermissionSub.SshCertificateTemplates}
                          >
                            <DropdownMenuItem
                              onClick={() => {
                                handlePopUpOpen("sshCertificate", {
                                  sshCaId,
                                  templateId: certificateTemplate.id
                                });
                              }}
                              icon={
                                <FontAwesomeIcon icon={faCertificate} size="sm" className="mr-1" />
                              }
                            >
                              Issue Certificate
                            </DropdownMenuItem>
                          </ProjectPermissionCan>
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Edit}
                            a={ProjectPermissionSub.SshCertificateTemplates}
                          >
                            <DropdownMenuItem
                              onClick={() =>
                                handlePopUpOpen("sshCertificateTemplate", {
                                  id: certificateTemplate.id
                                })
                              }
                              icon={<FontAwesomeIcon icon={faFileAlt} size="sm" className="mr-1" />}
                            >
                              Edit Template
                            </DropdownMenuItem>
                          </ProjectPermissionCan>
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Delete}
                            a={ProjectPermissionSub.SshCertificateTemplates}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                disabled={!isAllowed}
                                icon={<FontAwesomeIcon icon={faTrash} size="sm" className="mr-1" />}
                                onClick={() =>
                                  handlePopUpOpen("deleteSshCertificateTemplate", {
                                    id: certificateTemplate.id,
                                    name: certificateTemplate.name
                                  })
                                }
                              >
                                Delete Template
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </Td>
                  </Tr>
                );
              })}
          </TBody>
        </Table>
        {!isPending && !data?.certificateTemplates?.length && (
          <EmptyState
            title="No certificate templates have been created for this SSH CA"
            icon={faFileAlt}
          />
        )}
      </TableContainer>
    </div>
  );
};
