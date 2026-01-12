import { format } from "date-fns";
import { BanIcon, CheckIcon, ClipboardListIcon, PencilIcon } from "lucide-react";

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
  UnstableButtonGroup,
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableIconButton
} from "@app/components/v3";
import { OrgPermissionIdentityActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useTimedReset } from "@app/hooks";
import { identityAuthToNameMap, useGetOrgIdentityMembershipById } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  identityId: string;
  isCurrentOrgIdentity?: boolean;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["identity", "identityAuthMethod", "deleteIdentity"]>,
    data?: object
  ) => void;
};

export const IdentityDetailsSection = ({
  identityId,
  handlePopUpOpen,
  isCurrentOrgIdentity
}: Props) => {
  const [, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });
  const { isSubOrganization } = useOrganization();

  const { data } = useGetOrgIdentityMembershipById(identityId);

  return data ? (
    <UnstableCard className="w-full lg:max-w-[24rem]">
      <UnstableCardHeader className="border-b">
        <UnstableCardTitle>Details</UnstableCardTitle>
        <UnstableCardDescription>Machine identity details</UnstableCardDescription>
        <UnstableCardAction>
          <OrgPermissionCan
            I={OrgPermissionIdentityActions.Edit}
            a={OrgPermissionSubjects.Identity}
          >
            {(isAllowed) => (
              <UnstableIconButton
                isDisabled={!isAllowed}
                onClick={() => {
                  handlePopUpOpen("identity", {
                    identityId,
                    name: data.identity.name,
                    orgId: data.identity.orgId,
                    hasDeleteProtection: data.identity.hasDeleteProtection,
                    role: data.role,
                    customRole: data.customRole,
                    metadata: data.metadata
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
      </UnstableCardHeader>
      <UnstableCardContent>
        <DetailGroup>
          <Detail>
            <DetailLabel>Name</DetailLabel>
            <DetailValue>{data.identity.name}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>ID</DetailLabel>
            <DetailValue className="flex items-center gap-x-1">
              {data.identity.id}
              <Tooltip content="Copy machine identity ID to clipboard">
                <UnstableIconButton
                  onClick={() => {
                    navigator.clipboard.writeText(data.identity.id);
                    setCopyTextId("Copied");
                  }}
                  variant="ghost"
                  size="xs"
                >
                  {/* TODO(scott): color this should be a button variant and create re-usable copy button */}
                  {isCopyingId ? <CheckIcon /> : <ClipboardListIcon className="text-label" />}
                </UnstableIconButton>
              </Tooltip>
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Managed by</DetailLabel>
            <DetailValue>
              {isSubOrganization && isCurrentOrgIdentity ? (
                <Badge variant="sub-org">
                  <SubOrgIcon />
                  Sub-Organization
                </Badge>
              ) : (
                <Badge variant="org">
                  <OrgIcon />
                  Organization
                </Badge>
              )}
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Organization Role</DetailLabel>
            <DetailValue>{data.role}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Metadata</DetailLabel>
            <DetailValue className="flex flex-wrap gap-2">
              {data?.metadata?.length ? (
                data.metadata?.map((el) => (
                  <UnstableButtonGroup className="min-w-0" key={el.id}>
                    <Badge isTruncatable>
                      <span>{el.key}</span>
                    </Badge>
                    <Badge variant="outline" isTruncatable>
                      <span>{el.value}</span>
                    </Badge>
                  </UnstableButtonGroup>
                ))
              ) : (
                <span className="text-muted">—</span>
              )}
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>
              {isSubOrganization && !isCurrentOrgIdentity ? "Joined sub-organization" : "Created"}
            </DetailLabel>
            <DetailValue>{format(data.createdAt, "PPpp")}</DetailValue>
          </Detail>
          {isCurrentOrgIdentity && (
            <>
              <Detail>
                <DetailLabel>Last Login Method</DetailLabel>
                <DetailValue>
                  {data.lastLoginAuthMethod ? (
                    identityAuthToNameMap[data.lastLoginAuthMethod]
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </DetailValue>
              </Detail>
              <Detail>
                <DetailLabel>Last Logged In</DetailLabel>
                <DetailValue>
                  {data.lastLoginTime ? (
                    format(data.lastLoginTime, "PPpp")
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </DetailValue>
              </Detail>
              <Detail>
                <DetailLabel>Delete protection</DetailLabel>
                <DetailValue>
                  {data.identity.hasDeleteProtection ? (
                    <Badge variant="success">
                      <CheckIcon />
                      Enabled
                    </Badge>
                  ) : (
                    <Badge variant="neutral">
                      <BanIcon />
                      Disabled
                    </Badge>
                  )}
                </DetailValue>
              </Detail>
            </>
          )}
        </DetailGroup>
      </UnstableCardContent>
    </UnstableCard>
  ) : (
    <div />
  );
};
