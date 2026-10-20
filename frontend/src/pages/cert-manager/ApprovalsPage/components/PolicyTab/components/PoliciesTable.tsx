import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistance } from "date-fns";
import {
  CheckIcon,
  CopyIcon,
  EllipsisVerticalIcon,
  FileQuestionIcon,
  PencilIcon,
  Trash2Icon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  IconButton,
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
import { useProject } from "@app/context";
import { useToggle } from "@app/hooks";
import {
  approvalPolicyQuery,
  ApprovalPolicyScope,
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
  applicationId?: string;
};

const PolicyActionsMenu = ({
  policy,
  handlePopUpOpen
}: {
  policy: TApprovalPolicy;
  handlePopUpOpen: Props["handlePopUpOpen"];
}) => {
  const [isIdCopied, setIsIdCopied] = useToggle(false);

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(policy.id);
      setIsIdCopied.on();
      createNotification({ type: "info", text: "Approval policy ID copied to clipboard" });
      setTimeout(() => setIsIdCopied.off(), 2000);
    } catch {
      createNotification({ type: "error", text: "Could not copy to clipboard" });
    }
  };

  return (
    <DropdownMenu>
      <Tooltip hoverable delayDuration={50}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <IconButton aria-label="More options" variant="ghost" size="xs">
              <EllipsisVerticalIcon />
            </IconButton>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>More options</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" sideOffset={5}>
        <DropdownMenuItem onClick={handleCopyId}>
          {isIdCopied ? <CheckIcon /> : <CopyIcon />}
          Copy ID
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handlePopUpOpen("policy", { policyId: policy.id, policy })}
        >
          <PencilIcon />
          Edit Policy
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlePopUpOpen("deletePolicy", { policyId: policy.id })}>
          <Trash2Icon />
          Delete Policy
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const PoliciesTable = ({ handlePopUpOpen, applicationId }: Props) => {
  const { currentProject } = useProject();
  const projectId = currentProject?.id || "";

  const { data: policies = [], isPending: isPoliciesLoading } = useQuery(
    approvalPolicyQuery.list({
      policyType: ApprovalPolicyType.CertRequest,
      scope: applicationId ? ApprovalPolicyScope.PkiApplication : ApprovalPolicyScope.Project,
      scopeId: applicationId || projectId
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

  if (!isPoliciesLoading && !sortedPolicies.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileQuestionIcon />
          </EmptyMedia>
          <EmptyTitle>No certificate approval policies found</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Policy Name</TableHead>
          <TableHead>Profile Name</TableHead>
          <TableHead>Approval Steps</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="w-5" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPoliciesLoading && <TableSkeletonRows columns={5} />}
        {!isPoliciesLoading &&
          sortedPolicies.map((policy) => {
            const profileNames = getProfileNames(policy);
            return (
              <TableRow key={policy.id} className="group">
                <TableCell>
                  <div className="flex items-center gap-x-2">
                    <span className="text-sm font-medium text-foreground">{policy.name}</span>
                    {policy.scopeType !== ApprovalPolicyScope.PkiApplication && (
                      <span className="rounded bg-surface-active px-2 py-0.5 text-[10px] tracking-wide text-foreground-secondary">
                        Legacy
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    {profileNames.slice(0, 3).map((name) => (
                      <span
                        key={name}
                        className="rounded bg-surface-active px-2 py-0.5 text-xs text-foreground-secondary"
                      >
                        {name}
                      </span>
                    ))}
                    {profileNames.length > 3 && (
                      <span className="text-xs text-muted">+{profileNames.length - 3} more</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-foreground-secondary">
                    {policy.steps.length} step{policy.steps.length !== 1 ? "s" : ""}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted">
                    {formatDistance(new Date(policy.createdAt), new Date(), { addSuffix: true })}
                  </span>
                </TableCell>
                <TableCell>
                  <PolicyActionsMenu policy={policy} handlePopUpOpen={handlePopUpOpen} />
                </TableCell>
              </TableRow>
            );
          })}
      </TableBody>
    </Table>
  );
};
