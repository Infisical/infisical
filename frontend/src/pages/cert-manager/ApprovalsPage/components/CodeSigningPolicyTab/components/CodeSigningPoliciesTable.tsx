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
    <>
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
              <TableRow key={`cs-policy-skeleton-${i + 1}`}>
                {Array.from({ length: 4 }).map((__, j) => (
                  <TableCell key={`cs-policy-skeleton-cell-${j + 1}`}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          {!isPoliciesLoading &&
            sortedPolicies.map((policy) => (
              <TableRow key={policy.id} className="group">
                <TableCell isTruncatable>
                  <span className="font-medium text-foreground">{policy.name}</span>
                </TableCell>
                <TableCell className="text-accent">
                  {policy.steps.length} step{policy.steps.length !== 1 ? "s" : ""}
                </TableCell>
                <TableCell className="whitespace-nowrap text-accent">
                  {format(new Date(policy.createdAt), "MMM d, yyyy")}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <IconButton variant="ghost" size="xs" aria-label="Policy actions">
                        <MoreHorizontalIcon />
                      </IconButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="min-w-40" align="end" sideOffset={2}>
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
        </TableBody>
      </Table>
      {!isPoliciesLoading && !sortedPolicies.length && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No signing policies yet</EmptyTitle>
            <EmptyDescription>
              Create a policy to require approval before signing operations.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </>
  );
};
