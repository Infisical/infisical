import { Fragment, useState } from "react";
import {
  faChevronDown,
  faChevronRight,
  faEllipsisV,
  faPencil,
  faTrash,
  faUsers
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { User, Users } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
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
import { useProject } from "@app/context";
import { getMemberLabel } from "@app/helpers/members";
import { useGetWorkspaceUsers, useListWorkspaceGroups } from "@app/hooks/api";
import {
  approvalPolicyQuery,
  ApprovalPolicyType,
  ApproverType
} from "@app/hooks/api/approvalPolicies";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["policy", "deletePolicy"]>,
    data?: object
  ) => void;
};

export const PoliciesTable = ({ handlePopUpOpen }: Props) => {
  const { currentProject } = useProject();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const projectId = currentProject?.id || "";

  const { data: policies = [], isPending: isPoliciesLoading } = useQuery(
    approvalPolicyQuery.list({
      policyType: ApprovalPolicyType.PamAccess,
      projectId
    })
  );

  const { data: members = [] } = useGetWorkspaceUsers(projectId);
  const { data: groups = [] } = useListWorkspaceGroups(projectId);

  const getApproverLabel = (approverId: string, approverType: ApproverType) => {
    if (approverType === ApproverType.User) {
      const member = members?.find((m) => m.user.id === approverId);
      if (member) {
        return getMemberLabel(member);
      }
    } else if (approverType === ApproverType.Group) {
      const group = groups?.find(({ group: g }) => g.id === approverId);
      if (group) {
        return group.group.name;
      }
    }
    return approverId;
  };

  const toggleRowExpansion = (policyId: string) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(policyId)) {
        newSet.delete(policyId);
      } else {
        newSet.add(policyId);
      }
      return newSet;
    });
  };

  return (
    <div>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th className="w-10" />
              <Th>Policy Name</Th>
              <Th>Max Approval Request TTL</Th>
              <Th>Min Access Duration</Th>
              <Th>Max Access Duration</Th>
              <Th>Conditions</Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isPoliciesLoading && <TableSkeleton columns={5} innerKey="approval-policies" />}
            {!isPoliciesLoading && policies.length === 0 && (
              <Tr>
                <Td colSpan={7}>
                  <EmptyState title="No policies found" icon={faUsers} />
                </Td>
              </Tr>
            )}
            {!isPoliciesLoading &&
              policies.map((policy) => {
                const isExpanded = expandedRows.has(policy.id);
                const maxTtl = policy.maxRequestTtl ? policy.maxRequestTtl : "No limit";
                const conditionsCount = policy.conditions.conditions.length;

                return (
                  <>
                    <Tr
                      key={policy.id}
                      className="group cursor-pointer hover:bg-mineshaft-700"
                      onClick={() => toggleRowExpansion(policy.id)}
                    >
                      <Td>
                        <IconButton
                          ariaLabel="expand"
                          variant="plain"
                          className="p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRowExpansion(policy.id);
                          }}
                        >
                          <FontAwesomeIcon
                            icon={isExpanded ? faChevronDown : faChevronRight}
                            className="text-mineshaft-400"
                          />
                        </IconButton>
                      </Td>
                      <Td>{policy.name}</Td>
                      <Td>{maxTtl}</Td>
                      <Td>{policy.constraints.constraints.accessDuration.min}</Td>
                      <Td>{policy.constraints.constraints.accessDuration.max}</Td>
                      <Td>
                        {conditionsCount} condition{conditionsCount !== 1 ? "s" : ""}
                      </Td>
                      <Td
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild className="rounded-lg">
                            <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                              <Tooltip content="More options">
                                <IconButton
                                  ariaLabel="More options"
                                  variant="plain"
                                  className="w-4 p-0"
                                  size="md"
                                >
                                  <FontAwesomeIcon icon={faEllipsisV} />
                                </IconButton>
                              </Tooltip>
                            </div>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="p-1">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePopUpOpen("policy", {
                                  policyId: policy.id,
                                  policy
                                });
                              }}
                              icon={<FontAwesomeIcon icon={faPencil} />}
                            >
                              Edit Policy
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePopUpOpen("deletePolicy", {
                                  policyId: policy.id,
                                  policyName: policy.name
                                });
                              }}
                              icon={<FontAwesomeIcon icon={faTrash} />}
                            >
                              Delete Policy
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </Td>
                    </Tr>
                    {isExpanded && (
                      <Tr className="bg-mineshaft-800">
                        <Td colSpan={7} className="p-0">
                          <div className="flex max-h-80 w-full gap-2 gap-4 overflow-auto overflow-x-hidden p-4">
                            <div className="flex-1">
                              <div className="mb-2 text-sm font-medium text-mineshaft-300">
                                Approval Conditions
                              </div>
                              {policy.conditions.conditions.map((step, index) => (
                                <Fragment key={`${policy.id}--${index + 1}`}>
                                  <div
                                    className={twMerge(
                                      "rounded border border-mineshaft-600 bg-mineshaft-900 p-3"
                                    )}
                                  >
                                    <div className="space-y-2">
                                      <div>
                                        <span className="text-sm font-medium text-mineshaft-300">
                                          Account Paths:
                                        </span>
                                        <p className="text-sm text-mineshaft-100">
                                          {step.accountPaths.join(", ")}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                  {index < policy.conditions.conditions.length - 1 && (
                                    <div className="flex items-center">
                                      <div className="flex flex-col items-center">
                                        <div className="h-3 w-px bg-mineshaft-500" />
                                        <span className="px-2 text-xs font-medium text-mineshaft-400">
                                          OR
                                        </span>
                                        <div className="h-3 w-px bg-mineshaft-500" />
                                      </div>
                                    </div>
                                  )}
                                </Fragment>
                              ))}
                            </div>
                            <div className="flex-2">
                              <div className="mb-2 text-sm font-medium text-mineshaft-300">
                                Approval Sequence
                              </div>
                              {policy.steps.map((step, index) => (
                                <div
                                  key={`${policy.id}-step-${index + 1}`}
                                  className={twMerge(
                                    "mb-3 rounded border border-mineshaft-600 bg-mineshaft-900",
                                    index === policy.steps.length - 1 && "mb-0"
                                  )}
                                >
                                  <div className="mb-2 flex items-center justify-between bg-mineshaft-700 p-3">
                                    <div className="text-sm font-medium text-mineshaft-200">
                                      Step {index + 1}
                                      {step.name && (
                                        <span className="ml-2 text-mineshaft-400">
                                          ({step.name})
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-mineshaft-400">
                                      Requires {step.requiredApprovals} approval
                                      {step.requiredApprovals !== 1 ? "s" : ""}
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-2 p-3">
                                    {step.approvers.map((approver, approverIndex) => (
                                      <Badge
                                        variant="neutral"
                                        key={`${policy.id}-step-${index + 1}-approver-${approverIndex + 1}`}
                                      >
                                        {approver.type === ApproverType.Group ? (
                                          <User />
                                        ) : (
                                          <Users />
                                        )}
                                        {getApproverLabel(approver.id, approver.type)}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </Td>
                      </Tr>
                    )}
                  </>
                );
              })}
          </TBody>
        </Table>
      </TableContainer>
    </div>
  );
};
