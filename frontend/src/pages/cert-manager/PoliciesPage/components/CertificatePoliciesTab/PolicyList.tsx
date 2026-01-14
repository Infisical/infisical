import { useCallback } from "react";
import { subject } from "@casl/ability";
import {
  faCheck,
  faCircleInfo,
  faCopy,
  faEdit,
  faEllipsis,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
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
import { useProject } from "@app/context";
import {
  ProjectPermissionCertificatePolicyActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { useToggle } from "@app/hooks";
import { TCertificatePolicy, useListCertificatePolicies } from "@app/hooks/api/certificatePolicies";

interface Props {
  onEditPolicy: (policy: TCertificatePolicy) => void;
  onDeletePolicy: (policy: TCertificatePolicy) => void;
}

export const PolicyList = ({ onEditPolicy, onDeletePolicy }: Props) => {
  const { currentProject } = useProject();
  const [isIdCopied, setIsIdCopied] = useToggle(false);

  const { data, isLoading } = useListCertificatePolicies({
    projectId: currentProject?.id || "",
    limit: 100,
    offset: 0
  });

  const policies = data?.certificatePolicies || [];

  const handleCopyId = useCallback(
    (policyId: string) => {
      setIsIdCopied.on();
      navigator.clipboard.writeText(policyId);

      createNotification({
        text: "Policy ID copied to clipboard",
        type: "info"
      });

      setTimeout(() => setIsIdCopied.off(), 2000);
    },
    [setIsIdCopied]
  );

  if (!currentProject?.id) {
    return null;
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const hasPolicies = !isLoading && policies && policies.length > 0;

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Name</Th>
            <Th>Created</Th>
            <Th className="w-5" />
          </Tr>
        </THead>
        <TBody>
          {isLoading && <TableSkeleton columns={3} innerKey="certificate-policies" />}
          {!isLoading && (!policies || policies.length === 0) && (
            <Tr>
              <Td colSpan={3}>
                <EmptyState title="No Certificate Policies" />
              </Td>
            </Tr>
          )}
          {hasPolicies &&
            policies.map((policy) => (
              <Tr
                key={policy.id}
                className="h-10 transition-colors duration-100 hover:bg-mineshaft-700"
              >
                <Td>
                  <div className="flex items-center gap-2">
                    <div className="text-mineshaft-300">{policy.name}</div>
                    {policy.description && (
                      <Tooltip content={policy.description}>
                        <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                      </Tooltip>
                    )}
                  </div>
                </Td>
                <Td>
                  <span className="text-sm text-bunker-300">{formatDate(policy.createdAt)}</span>
                </Td>
                <Td className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild className="rounded-lg">
                      <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                        <Tooltip content="More options">
                          <FontAwesomeIcon size="lg" icon={faEllipsis} />
                        </Tooltip>
                      </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="p-1">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyId(policy.id);
                        }}
                        icon={<FontAwesomeIcon icon={isIdCopied ? faCheck : faCopy} />}
                      >
                        Copy Policy ID
                      </DropdownMenuItem>
                      <ProjectPermissionCan
                        I={ProjectPermissionCertificatePolicyActions.Edit}
                        a={subject(ProjectPermissionSub.CertificatePolicies, {
                          name: policy.name
                        })}
                      >
                        {(isAllowed) =>
                          isAllowed && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditPolicy(policy);
                              }}
                              icon={<FontAwesomeIcon icon={faEdit} />}
                            >
                              Edit Policy
                            </DropdownMenuItem>
                          )
                        }
                      </ProjectPermissionCan>
                      <ProjectPermissionCan
                        I={ProjectPermissionCertificatePolicyActions.Delete}
                        a={subject(ProjectPermissionSub.CertificatePolicies, {
                          name: policy.name
                        })}
                      >
                        {(isAllowed) =>
                          isAllowed && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeletePolicy(policy);
                              }}
                              icon={<FontAwesomeIcon icon={faTrash} />}
                            >
                              Delete Policy
                            </DropdownMenuItem>
                          )
                        }
                      </ProjectPermissionCan>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Td>
              </Tr>
            ))}
        </TBody>
      </Table>
    </TableContainer>
  );
};
