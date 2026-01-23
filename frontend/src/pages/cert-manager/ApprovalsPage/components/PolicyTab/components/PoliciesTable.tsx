import { useMemo } from "react";
import {
  faEdit,
  faEllipsisV,
  faFileCircleQuestion,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { formatDistance } from "date-fns";

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
import { useProject } from "@app/context";
import {
  approvalPolicyQuery,
  ApprovalPolicyType,
  CertRequestPolicyConditions,
  TApprovalPolicy
} from "@app/hooks/api/approvalPolicies";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["policy", "deletePolicy"]>,
    data?: { policyId: string; policy?: TApprovalPolicy }
  ) => void;
};

export const PoliciesTable = ({ handlePopUpOpen }: Props) => {
  const { currentProject } = useProject();
  const projectId = currentProject?.id || "";

  const { data: policies = [], isPending: isPoliciesLoading } = useQuery(
    approvalPolicyQuery.list({
      policyType: ApprovalPolicyType.CertRequest,
      projectId
    })
  );

  const sortedPolicies = useMemo(() => {
    return [...policies].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [policies]);

  const getProfileNames = (policy: TApprovalPolicy): string[] => {
    const conditions = policy.conditions.conditions as CertRequestPolicyConditions;
    return conditions.flatMap((c: { profileNames: string[] }) => c.profileNames);
  };

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Policy Name</Th>
            <Th>Profile Name</Th>
            <Th>Approval Steps</Th>
            <Th>Created</Th>
            <Th className="w-5" />
          </Tr>
        </THead>
        <TBody>
          {isPoliciesLoading && <TableSkeleton columns={5} innerKey="cert-approval-policies" />}
          {!isPoliciesLoading &&
            sortedPolicies.map((policy) => {
              const profileNames = getProfileNames(policy);
              return (
                <Tr key={policy.id} className="group">
                  <Td>
                    <div className="text-sm font-medium text-mineshaft-100">{policy.name}</div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-1">
                      {profileNames.slice(0, 3).map((name) => (
                        <span
                          key={name}
                          className="rounded bg-mineshaft-600 px-2 py-0.5 text-xs text-mineshaft-200"
                        >
                          {name}
                        </span>
                      ))}
                      {profileNames.length > 3 && (
                        <span className="text-xs text-mineshaft-400">
                          +{profileNames.length - 3} more
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td>
                    <span className="text-sm text-mineshaft-200">
                      {policy.steps.length} step{policy.steps.length !== 1 ? "s" : ""}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-sm text-mineshaft-400">
                      {formatDistance(new Date(policy.createdAt), new Date(), { addSuffix: true })}
                    </span>
                  </Td>
                  <Td>
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
                      <DropdownMenuContent align="end" className="p-1" sideOffset={5}>
                        <DropdownMenuItem
                          onClick={() => handlePopUpOpen("policy", { policyId: policy.id, policy })}
                          icon={<FontAwesomeIcon icon={faEdit} />}
                        >
                          Edit Policy
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handlePopUpOpen("deletePolicy", { policyId: policy.id })}
                          icon={<FontAwesomeIcon icon={faTrash} />}
                        >
                          Delete Policy
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Td>
                </Tr>
              );
            })}
        </TBody>
      </Table>
      {!isPoliciesLoading && !sortedPolicies.length && (
        <EmptyState title="No certificate approval policies found" icon={faFileCircleQuestion} />
      )}
    </TableContainer>
  );
};
