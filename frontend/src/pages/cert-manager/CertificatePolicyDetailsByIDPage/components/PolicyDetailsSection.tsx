import { subject } from "@casl/ability";
import { format } from "date-fns";
import { CheckIcon, ClipboardListIcon, EllipsisIcon, PencilIcon, Trash2Icon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  ProjectPermissionCertificatePolicyActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { useTimedReset } from "@app/hooks";
import { TCertificatePolicy } from "@app/hooks/api/certificatePolicies";

type Props = {
  policy: TCertificatePolicy;
  onEdit: () => void;
  onDelete: () => void;
};

export const PolicyDetailsSection = ({ policy, onEdit, onDelete }: Props) => {
  const [, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });

  return (
    <Card className="w-full">
      <CardHeader className="border-b">
        <CardTitle>Details</CardTitle>
        <CardDescription>Certificate policy details</CardDescription>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton variant="ghost" size="xs" aria-label="Policy options">
                <EllipsisIcon />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-40" align="end" sideOffset={2}>
              <ProjectPermissionCan
                I={ProjectPermissionCertificatePolicyActions.Edit}
                a={subject(ProjectPermissionSub.CertificatePolicies, { name: policy.name })}
              >
                {(canEdit) => (
                  <DropdownMenuItem isDisabled={!canEdit} onClick={onEdit}>
                    <PencilIcon />
                    Edit Policy
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
              <ProjectPermissionCan
                I={ProjectPermissionCertificatePolicyActions.Delete}
                a={subject(ProjectPermissionSub.CertificatePolicies, { name: policy.name })}
              >
                {(canDelete) => (
                  <DropdownMenuItem variant="danger" isDisabled={!canDelete} onClick={onDelete}>
                    <Trash2Icon />
                    Delete Policy
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent>
        <DetailGroup>
          <Detail>
            <DetailLabel>Name</DetailLabel>
            <DetailValue>{policy.name}</DetailValue>
          </Detail>

          <Detail>
            <DetailLabel>Policy ID</DetailLabel>
            <DetailValue className="flex items-center gap-x-1">
              <span className="break-all">{policy.id}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      navigator.clipboard.writeText(policy.id);
                      setCopyTextId("Copied");
                    }}
                  >
                    {isCopyingId ? <CheckIcon /> : <ClipboardListIcon className="text-label" />}
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent>{isCopyingId ? "Copied" : "Copy ID to clipboard"}</TooltipContent>
              </Tooltip>
            </DetailValue>
          </Detail>

          {policy.description && (
            <Detail>
              <DetailLabel>Description</DetailLabel>
              <DetailValue>{policy.description}</DetailValue>
            </Detail>
          )}

          {policy.createdAt && (
            <Detail>
              <DetailLabel>Created</DetailLabel>
              <DetailValue>
                {format(new Date(policy.createdAt), "MMM d, yyyy 'at' h:mm a")}
              </DetailValue>
            </Detail>
          )}

          {policy.updatedAt && (
            <Detail>
              <DetailLabel>Last Updated</DetailLabel>
              <DetailValue>
                {format(new Date(policy.updatedAt), "MMM d, yyyy 'at' h:mm a")}
              </DetailValue>
            </Detail>
          )}
        </DetailGroup>
      </CardContent>
    </Card>
  );
};
