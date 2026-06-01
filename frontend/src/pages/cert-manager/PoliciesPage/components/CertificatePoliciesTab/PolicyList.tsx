import { useCallback } from "react";
import { subject } from "@casl/ability";
import { Link } from "@tanstack/react-router";
import {
  CheckIcon,
  CopyIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
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
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
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
  const { currentOrg } = useOrganization();
  const [isIdCopied, setIsIdCopied] = useToggle(false);

  const { data, isLoading } = useListCertificatePolicies({
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

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString();

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!policies || policies.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No existing certificate policies</EmptyTitle>
          <EmptyDescription>
            Create a policy to set the rules your certificates must follow when issued.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="w-5" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {policies.map((policy) => (
          <TableRow key={policy.id}>
            <TableCell>
              <div className="flex items-center gap-2">
                <Link
                  to="/organizations/$orgId/projects/cert-manager/$projectId/certificate-policies/$policyId"
                  params={{
                    orgId: currentOrg.id,
                    projectId: currentProject.id,
                    policyId: policy.id
                  }}
                  className="hover:underline"
                >
                  {policy.name}
                </Link>
                {policy.description && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon className="size-3.5 text-muted" />
                    </TooltipTrigger>
                    <TooltipContent>{policy.description}</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </TableCell>
            <TableCell>
              <span className="text-sm">{formatDate(policy.createdAt)}</span>
            </TableCell>
            <TableCell className="text-right">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton variant="ghost" size="xs" aria-label="Policy actions">
                    <MoreHorizontalIcon />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="min-w-40" align="end" sideOffset={2}>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyId(policy.id);
                    }}
                  >
                    {isIdCopied ? <CheckIcon /> : <CopyIcon />}
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
                        >
                          <PencilIcon />
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
                          variant="danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeletePolicy(policy);
                          }}
                        >
                          <Trash2Icon />
                          Delete Policy
                        </DropdownMenuItem>
                      )
                    }
                  </ProjectPermissionCan>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
