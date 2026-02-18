import { format } from "date-fns";
import { CheckIcon, ClipboardListIcon, PencilIcon } from "lucide-react";

import { OrgPermissionCan } from "@app/components/permissions";
import { Tooltip } from "@app/components/v2";
import {
  Badge,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  OrgIcon,
  SubOrgIcon,
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableIconButton
} from "@app/components/v3";
import { OrgPermissionGroupActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useTimedReset } from "@app/hooks";
import { useGetGroupById } from "@app/hooks/api/";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  groupId: string;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["groupCreateUpdate"]>, data?: object) => void;
  canEditGroup?: boolean;
};

export const GroupDetailsSection = ({ groupId, handlePopUpOpen, canEditGroup = true }: Props) => {
  const { data } = useGetGroupById(groupId);
  const { currentOrg, isSubOrganization } = useOrganization();

  const [, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });

  const [, isCopyingSlug, setCopyTextSlug] = useTimedReset<string>({
    initialState: "Copy slug to clipboard"
  });

  return data ? (
    <UnstableCard className="w-full lg:max-w-[24rem]">
      <UnstableCardHeader className="border-b">
        <UnstableCardTitle>Details</UnstableCardTitle>
        <UnstableCardDescription>Group details</UnstableCardDescription>
        {canEditGroup && (
          <UnstableCardAction>
            <OrgPermissionCan I={OrgPermissionGroupActions.Edit} a={OrgPermissionSubjects.Groups}>
              {(isAllowed) => (
                <UnstableIconButton
                  isDisabled={!isAllowed}
                  onClick={() => {
                    handlePopUpOpen("groupCreateUpdate", {
                      groupId,
                      name: data.group.name,
                      slug: data.group.slug,
                      role: data.group.roleId || data.group.role
                    });
                  }}
                  size="xs"
                  variant="outline"
                >
                  <PencilIcon />
                </UnstableIconButton>
              )}
            </OrgPermissionCan>
          </UnstableCardAction>
        )}
      </UnstableCardHeader>
      <UnstableCardContent>
        <DetailGroup>
          <Detail>
            <DetailLabel>Name</DetailLabel>
            <DetailValue>{data.group.name}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>ID</DetailLabel>
            <DetailValue className="flex items-center gap-x-1">
              {data.group.id}
              <Tooltip content="Copy group ID to clipboard">
                <UnstableIconButton
                  onClick={() => {
                    navigator.clipboard.writeText(data.group.id);
                    setCopyTextId("Copied");
                  }}
                  variant="ghost"
                  size="xs"
                >
                  {isCopyingId ? <CheckIcon /> : <ClipboardListIcon className="text-label" />}
                </UnstableIconButton>
              </Tooltip>
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Slug</DetailLabel>
            <DetailValue className="flex items-center gap-x-1">
              {data.group.slug}
              <Tooltip content="Copy slug to clipboard">
                <UnstableIconButton
                  onClick={() => {
                    navigator.clipboard.writeText(data.group.slug);
                    setCopyTextSlug("Copied");
                  }}
                  variant="ghost"
                  size="xs"
                >
                  {isCopyingSlug ? <CheckIcon /> : <ClipboardListIcon className="text-label" />}
                </UnstableIconButton>
              </Tooltip>
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Organization Role</DetailLabel>
            <DetailValue>{data.group.role}</DetailValue>
          </Detail>
          {isSubOrganization && currentOrg && (
            <Detail>
              <DetailLabel>Managed By</DetailLabel>
              <DetailValue>
                {data.group.orgId === currentOrg.id ? (
                  <Badge variant="sub-org">
                    <SubOrgIcon />
                    Sub-Organization
                  </Badge>
                ) : (
                  <Badge variant="org">
                    <OrgIcon />
                    Root Organization
                  </Badge>
                )}
              </DetailValue>
            </Detail>
          )}
          <Detail>
            <DetailLabel>Created</DetailLabel>
            <DetailValue>{format(data.group.createdAt, "PPpp")}</DetailValue>
          </Detail>
        </DetailGroup>
      </UnstableCardContent>
    </UnstableCard>
  ) : (
    <div />
  );
};
