import { useMemo } from "react";
import {
  faClock,
  faEdit,
  faEllipsisV,
  faFileCircleQuestion,
  faHandPointer,
  faHashtag,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

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
  TApprovalPolicy
} from "@app/hooks/api/approvalPolicies";
import { UsePopUpState } from "@app/hooks/usePopUp";

type CodeSigningConstraints = {
  maxWindowDuration?: string;
  maxSignings?: number;
};

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["policy", "deletePolicy"]>,
    data?: { policyId: string; policy?: TApprovalPolicy }
  ) => void;
};

export const CodeSigningPoliciesTable = ({ handlePopUpOpen }: Props) => {
  const { currentProject } = useProject();
  const projectId = currentProject?.id || "";

  const { data: policies = [], isPending: isPoliciesLoading } = useQuery(
    approvalPolicyQuery.list({
      policyType: ApprovalPolicyType.CertCodeSigning,
      projectId
    })
  );

  const sortedPolicies = useMemo(() => {
    return [...policies].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [policies]);

  const getApprovalModeConfig = (policy: TApprovalPolicy) => {
    const constraints = policy.constraints?.constraints as CodeSigningConstraints | undefined;
    const hasTime = Boolean(constraints?.maxWindowDuration);
    const hasCount = Boolean(constraints?.maxSignings);
    if (hasTime && hasCount) return { label: "Combined", icon: faClock };
    if (hasTime) return { label: "Time-based", icon: faClock };
    if (hasCount) return { label: "Count-based", icon: faHashtag };
    return { label: "Manual", icon: faHandPointer };
  };

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Policy Name</Th>
            <Th>Approval Mode</Th>
            <Th>Approval Steps</Th>
            <Th>Created</Th>
            <Th className="w-5" />
          </Tr>
        </THead>
        <TBody>
          {isPoliciesLoading && <TableSkeleton columns={5} innerKey="cs-approval-policies" />}
          {!isPoliciesLoading &&
            sortedPolicies.map((policy) => (
              <Tr key={policy.id} className="group">
                <Td>
                  <div className="text-sm font-medium text-mineshaft-100">{policy.name}</div>
                </Td>
                <Td>
                  {(() => {
                    const config = getApprovalModeConfig(policy);
                    return (
                      <span className="inline-flex items-center gap-1.5 rounded bg-mineshaft-600 px-2 py-0.5 text-xs text-mineshaft-200">
                        <FontAwesomeIcon icon={config.icon} className="h-3 w-3" />
                        {config.label}
                      </span>
                    );
                  })()}
                </Td>
                <Td>
                  <span className="text-sm text-mineshaft-200">
                    {policy.steps.length} step{policy.steps.length !== 1 ? "s" : ""}
                  </span>
                </Td>
                <Td>
                  <span className="text-sm text-mineshaft-400">
                    {format(new Date(policy.createdAt), "MMM d, yyyy")}
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
            ))}
        </TBody>
      </Table>
      {!isPoliciesLoading && !sortedPolicies.length && (
        <EmptyState title="No approval policies found" icon={faFileCircleQuestion} />
      )}
    </TableContainer>
  );
};
