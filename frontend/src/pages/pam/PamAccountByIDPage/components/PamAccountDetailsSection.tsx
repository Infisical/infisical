import { format } from "date-fns";
import { PencilIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  UnstableIconButton
} from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionPamAccountActions } from "@app/context/ProjectPermissionContext/types";
import { PAM_RESOURCE_TYPE_MAP, PamAccountRotationStatus, TPamAccount } from "@app/hooks/api/pam";
import { useGetPamAccountById } from "@app/hooks/api/pam/queries";

type Props = {
  account: TPamAccount;
  onEdit: VoidFunction;
};

const rotationStatusVariant = (status?: string | null) => {
  switch (status) {
    case PamAccountRotationStatus.Success:
      return "success" as const;
    case PamAccountRotationStatus.Failed:
      return "danger" as const;
    case PamAccountRotationStatus.PartialSuccess:
      return "warning" as const;
    case PamAccountRotationStatus.Rotating:
      return "info" as const;
    default:
      return "neutral" as const;
  }
};

const rotationStatusLabel = (status?: string | null) => {
  switch (status) {
    case PamAccountRotationStatus.Success:
      return "Success";
    case PamAccountRotationStatus.Failed:
      return "Failed";
    case PamAccountRotationStatus.PartialSuccess:
      return "Partial";
    case PamAccountRotationStatus.Rotating:
      return "Rotating";
    default:
      return "Never";
  }
};

export const PamAccountDetailsSection = ({ account, onEdit }: Props) => {
  const resourceTypeInfo = PAM_RESOURCE_TYPE_MAP[account.resource.resourceType];
  const isRotating = account.rotationStatus === PamAccountRotationStatus.Rotating;

  // Poll for status updates while rotation is in progress
  useGetPamAccountById(account.id, {
    refetchInterval: isRotating ? 3000 : false
  });

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-container px-4 py-3">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h3 className="text-lg font-medium">Details</h3>
        <ProjectPermissionCan
          I={ProjectPermissionPamAccountActions.Edit}
          a={ProjectPermissionSub.PamAccounts}
        >
          {(isAllowed) => (
            <UnstableIconButton variant="ghost" size="xs" onClick={onEdit} isDisabled={!isAllowed}>
              <PencilIcon />
            </UnstableIconButton>
          )}
        </ProjectPermissionCan>
      </div>
      <DetailGroup>
        <Detail>
          <DetailLabel>Name</DetailLabel>
          <DetailValue>{account.name}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Description</DetailLabel>
          <DetailValue>{account.description || "-"}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Type</DetailLabel>
          <DetailValue>
            <div className="flex items-center gap-2">
              <img
                alt={resourceTypeInfo.name}
                src={`/images/integrations/${resourceTypeInfo.image}`}
                className="size-4"
              />
              {resourceTypeInfo.name} Account
            </div>
          </DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Parent Resource</DetailLabel>
          <DetailValue>{account.resource.name}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Created</DetailLabel>
          <DetailValue>{format(new Date(account.createdAt), "MM/dd/yyyy, hh:mm a")}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Rotation Status</DetailLabel>
          <DetailValue>
            <Badge
              variant={rotationStatusVariant(account.rotationStatus)}
              className={isRotating ? "animate-pulse" : undefined}
            >
              {rotationStatusLabel(account.rotationStatus)}
            </Badge>
          </DetailValue>
        </Detail>
        {(account.rotationStatus === PamAccountRotationStatus.Failed ||
          account.rotationStatus === PamAccountRotationStatus.PartialSuccess) &&
          account.lastRotationMessage && (
            <Detail>
              <DetailLabel>Last Rotation Message</DetailLabel>
              <DetailValue
                className={`text-xs break-words ${
                  account.rotationStatus === PamAccountRotationStatus.Failed
                    ? "text-danger"
                    : "text-warning"
                }`}
              >
                {account.lastRotationMessage}
              </DetailValue>
            </Detail>
          )}
        {"lastRotatedAt" in account && account.lastRotatedAt && (
          <Detail>
            <DetailLabel>Last Rotated</DetailLabel>
            <DetailValue>
              {format(new Date(account.lastRotatedAt as string), "MM/dd/yyyy, hh:mm a")}
            </DetailValue>
          </Detail>
        )}
      </DetailGroup>
    </div>
  );
};
