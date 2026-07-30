import { subject } from "@casl/ability";
import { format } from "date-fns";
import { BanIcon, CheckIcon, ClipboardListIcon, PencilIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { Tooltip } from "@app/components/v2";
import {
  Badge,
  ButtonGroup,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  IconButton,
  OrgIcon,
  ProjectIcon,
  SubOrgIcon
} from "@app/components/v3";
import { ProjectPermissionIdentityActions, ProjectPermissionSub, useProject } from "@app/context";
import { usePopUp, useTimedReset } from "@app/hooks";
import { identityAuthToNameMap, TProjectIdentity } from "@app/hooks/api";
import { IdentityProjectMembershipV1 } from "@app/hooks/api/identities/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectIdentityModal } from "@app/pages/project/AccessControlPage/components/IdentityTab/components/ProjectIdentityModal";

import { ProjectIdentityAlertDetail } from "./ProjectIdentityAlertDetail";

type Props = {
  identity: TProjectIdentity;
  isOrgIdentity?: boolean;
  isSubOrgIdentity?: boolean;
  membership: IdentityProjectMembershipV1;
};

export const ProjectIdentityDetailsSection = ({
  identity,
  isOrgIdentity,
  isSubOrgIdentity,
  membership
}: Props) => {
  const { currentProject } = useProject();
  const isCertManager = currentProject?.type === ProjectType.CertificateManager;

  // eslint-disable-next-line @typescript-eslint/naming-convention,@typescript-eslint/no-unused-vars
  const [_, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });

  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp(["editIdentity"] as const);

  return (
    <>
      <Card className="w-full lg:max-w-[24rem]">
        <CardHeader className="border-b">
          <CardTitle>Details</CardTitle>
          <CardDescription>Machine identity details</CardDescription>
          {!isOrgIdentity && (
            <CardAction>
              <ProjectPermissionCan
                I={ProjectPermissionIdentityActions.Edit}
                a={subject(ProjectPermissionSub.Identity, {
                  identityId: identity.id
                })}
              >
                {(isAllowed) => (
                  <IconButton
                    isDisabled={!isAllowed}
                    onClick={() => {
                      handlePopUpOpen("editIdentity");
                    }}
                    size="xs"
                    variant="outline"
                  >
                    <PencilIcon />
                  </IconButton>
                )}
              </ProjectPermissionCan>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
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
                  <IconButton
                    onClick={() => {
                      navigator.clipboard.writeText(identity.id);
                      setCopyTextId("Copied");
                    }}
                    variant="ghost"
                    size="xs"
                  >
                    {/* TODO(scott): color this should be a button variant and create re-usable copy button */}
                    {isCopyingId ? <CheckIcon /> : <ClipboardListIcon className="text-label" />}
                  </IconButton>
                </Tooltip>
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Managed by</DetailLabel>
              <DetailValue>
                {isOrgIdentity ? (
                  <Badge variant={isSubOrgIdentity ? "sub-org" : "org"}>
                    {isSubOrgIdentity ? <SubOrgIcon /> : <OrgIcon />}
                    {isSubOrgIdentity ? "Sub-" : ""}Organization
                  </Badge>
                ) : (
                  <Badge variant="project">
                    <ProjectIcon />
                    {isCertManager ? "Certificate Manager" : "Project"}
                  </Badge>
                )}
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Metadata</DetailLabel>
              <DetailValue className="flex flex-wrap gap-2">
                {identity?.metadata?.length ? (
                  identity.metadata?.map((el) => (
                    <ButtonGroup className="min-w-0" key={el.id}>
                      <Badge isTruncatable>
                        <span>{el.key}</span>
                      </Badge>
                      <Badge variant="outline" isTruncatable>
                        <span>{el.value}</span>
                      </Badge>
                    </ButtonGroup>
                  ))
                ) : (
                  <span className="text-muted">—</span>
                )}
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>
                {/* eslint-disable-next-line no-nested-ternary */}
                {isOrgIdentity
                  ? isCertManager
                    ? "Joined certificate manager"
                    : "Joined project"
                  : "Created"}
              </DetailLabel>
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
                      <span className="text-muted">—</span>
                    )}
                  </DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Last Logged In</DetailLabel>
                  <DetailValue>
                    {membership.lastLoginTime ? (
                      format(membership.lastLoginTime, "PPpp")
                    ) : (
                      <span className="text-muted">—</span>
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
                {currentProject && (
                  <ProjectIdentityAlertDetail
                    identityId={identity.id}
                    identityName={identity.name}
                    projectId={currentProject.id}
                    projectName={currentProject.name}
                  />
                )}
              </>
            )}
            {isOrgIdentity && (
              <ProjectIdentityAlertDetail
                identityId={identity.id}
                identityName={identity.name}
                readOnly
              />
            )}
          </DetailGroup>
        </CardContent>
      </Card>
      <Dialog
        open={popUp.editIdentity.isOpen}
        onOpenChange={(open) => handlePopUpToggle("editIdentity", open)}
      >
        <DialogContent className="max-w-xl overflow-visible">
          <DialogHeader>
            <DialogTitle>Edit Project Identity</DialogTitle>
            <DialogDescription>
              Update the identity&apos;s name, delete protection, and metadata.
            </DialogDescription>
          </DialogHeader>
          <ProjectIdentityModal
            identity={identity}
            onClose={() => handlePopUpToggle("editIdentity", false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};
