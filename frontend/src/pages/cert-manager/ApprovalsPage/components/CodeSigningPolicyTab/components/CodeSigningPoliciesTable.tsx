import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  approvalPolicyQuery,
  ApprovalPolicyScope,
  ApprovalPolicyType,
  TApprovalPolicy
} from "@app/hooks/api/approvalPolicies";
import { UsePopUpState } from "@app/hooks/usePopUp";

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
      scope: ApprovalPolicyScope.Project,
      scopeId: projectId
    })
  );

  const sortedPolicies = useMemo(() => {
    return [...policies].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [policies]);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Policy Name</TableHead>
          <TableHead>Approval Steps</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="w-5" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPoliciesLoading &&
          Array.from({ length: 3 }).map((_, i) => (
            <TableRow key={`policy-skeleton-${i + 1}`}>
              {Array.from({ length: 4 }).map((__, j) => (
                <TableCell key={`policy-skeleton-cell-${j + 1}`}>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        {!isPoliciesLoading &&
          sortedPolicies.map((policy) => (
            <TableRow key={policy.id} className="group">
              <TableCell>
                <div className="text-sm font-medium text-foreground">{policy.name}</div>
              </TableCell>
              <TableCell>
                <span className="text-sm text-accent">
                  {policy.steps.length} step{policy.steps.length !== 1 ? "s" : ""}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-sm text-accent">
                  {format(new Date(policy.createdAt), "MMM d, yyyy")}
                </span>
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <IconButton variant="ghost" size="xs" aria-label="More options">
                      <MoreHorizontalIcon />
                    </IconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={2}>
                    <DropdownMenuItem
                      onClick={() => handlePopUpOpen("policy", { policyId: policy.id, policy })}
                    >
                      <PencilIcon />
                      Edit Policy
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="danger"
                      onClick={() => handlePopUpOpen("deletePolicy", { policyId: policy.id })}
                    >
                      <Trash2Icon />
                      Delete Policy
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        {!isPoliciesLoading && !sortedPolicies.length && (
          <TableRow>
            <td colSpan={4} className="p-0">
              <Empty className="border-none">
                <EmptyHeader>
                  <EmptyTitle>No signing policies found</EmptyTitle>
                  <EmptyDescription>
                    Create a policy to require approval before signing operations
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </td>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
};
