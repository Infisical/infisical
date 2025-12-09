import { subject } from "@casl/ability";
import { format } from "date-fns";
import { BanIcon, CheckIcon, ClipboardListIcon, PencilIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { Modal, ModalContent, Tooltip } from "@app/components/v2";
import {
  Badge,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  OrgIcon,
  ProjectIcon,
  UnstableButtonGroup,
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableIconButton
} from "@app/components/v3";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/context";
import { usePopUp, useTimedReset } from "@app/hooks";
import { identityAuthToNameMap, TProjectIdentity } from "@app/hooks/api";
import { IdentityProjectMembershipV1 } from "@app/hooks/api/identities/types";
import { ProjectIdentityModal } from "@app/pages/project/AccessControlPage/components/IdentityTab/components/ProjectIdentityModal";

type Props = {
  identity: TProjectIdentity;
  isOrgIdentity?: boolean;
  membership: IdentityProjectMembershipV1;
};

export const ProjectIdentityDetailsSection = ({ identity, isOrgIdentity, membership }: Props) => {
  // eslint-disable-next-line @typescript-eslint/naming-convention,@typescript-eslint/no-unused-vars
  const [_, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });

  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp(["editIdentity"] as const);

  return (
    <>
      <UnstableCard className="w-full max-w-[22rem]">
        <UnstableCardHeader
        // className="border-b"
        >
          <UnstableCardTitle>Details</UnstableCardTitle>
          <UnstableCardDescription>Machine identity details</UnstableCardDescription>
          {!isOrgIdentity && (
            <UnstableCardAction>
              <ProjectPermissionCan
                I={ProjectPermissionIdentityActions.Edit}
                a={subject(ProjectPermissionSub.Identity, {
                  identityId: identity.id
                })}
              >
                {(isAllowed) => (
                  <UnstableIconButton
                    isDisabled={!isAllowed}
                    onClick={() => {
                      handlePopUpOpen("editIdentity");
                    }}
                    size="xs"
                    variant="outline"
                  >
                    <PencilIcon />
                  </UnstableIconButton>
                )}
              </ProjectPermissionCan>
            </UnstableCardAction>
          )}
        </UnstableCardHeader>
        <UnstableCardContent>
          <DetailGroup>
            <Detail>
              <DetailLabel>Name</DetailLabel>
              <DetailValue>{identity.name}</DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>ID</DetailLabel>
              <DetailValue className="flex items-center gap-x-1">
                {identity.id}
                <Tooltip content="Copy machine identity ID to clipboard">
                  <UnstableIconButton
                    onClick={() => {
                      navigator.clipboard.writeText(identity.id);
                      setCopyTextId("Copied");
                    }}
                    variant="ghost"
                    size="xs"
                  >
                    {/* TODO(scott): color this should be a button variant */}
                    {isCopyingId ? <CheckIcon /> : <ClipboardListIcon className="text-label" />}
                  </UnstableIconButton>
                </Tooltip>
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Managed by</DetailLabel>
              <DetailValue>
                {isOrgIdentity ? (
                  <Badge variant="org">
                    <OrgIcon />
                    Organization
                  </Badge>
                ) : (
                  <Badge variant="project">
                    <ProjectIcon />
                    Project
                  </Badge>
                )}
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Metadata</DetailLabel>
              <DetailValue className="flex flex-wrap gap-2">
                {identity?.metadata?.length ? (
                  identity.metadata?.map((el) => (
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
                  <span className="text-muted italic">No metadata</span>
                )}
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>{isOrgIdentity ? "Joined project" : "Created"}</DetailLabel>
              <DetailValue>{format(membership.createdAt, "PPpp")}</DetailValue>
            </Detail>
            {!isOrgIdentity && (
              <>
                <Detail>
                  <DetailLabel>Last Login Method</DetailLabel>
                  <DetailValue>
                    {membership.lastLoginAuthMethod ? (
                      identityAuthToNameMap[membership.lastLoginAuthMethod]
                    ) : (
                      <span className="text-muted italic">N/A</span>
                    )}
                  </DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Last Logged In</DetailLabel>
                  <DetailValue>
                    {membership.lastLoginTime ? (
                      format(membership.lastLoginTime, "PPpp")
                    ) : (
                      <span className="text-muted italic">N/A</span>
                    )}
                  </DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Delete protection</DetailLabel>
                  <DetailValue>
                    {identity.hasDeleteProtection ? (
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
      <Modal
        isOpen={popUp.editIdentity.isOpen}
        onOpenChange={(open) => handlePopUpToggle("editIdentity", open)}
      >
        <ModalContent bodyClassName="overflow-visible" title="Edit Project Identity">
          <ProjectIdentityModal
            identity={identity}
            onClose={() => handlePopUpToggle("editIdentity", false)}
          />
        </ModalContent>
      </Modal>
    </>
  );
};
