import { subject } from "@casl/ability";
import { PlusIcon } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  UnstableButton,
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableEmpty,
  UnstableEmptyContent,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle
} from "@app/components/v3";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/context";
import { IdentityAuthMethod, TProjectIdentity } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";
import { IdentityAuthMethodModal } from "@app/pages/organization/AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/IdentityAuthMethodModal";
import { ViewIdentityAuth } from "@app/pages/organization/IdentityDetailsByIDPage/components/ViewIdentityAuth";

type Props = {
  identity: TProjectIdentity;
  refetchIdentity: () => void;
};

export const ProjectIdentityAuthenticationSection = ({ identity, refetchIdentity }: Props) => {
  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp([
    "identityAuthMethod",
    "upgradePlan",
    "revokeAuthMethod"
  ]);

  const hasAuthMethods = Boolean(identity.authMethods.length);

  return (
    <>
      <UnstableCard>
        <UnstableCardHeader>
          <UnstableCardTitle>Authentication</UnstableCardTitle>
          <UnstableCardDescription>Configure authentication methods</UnstableCardDescription>
          {hasAuthMethods &&
            !Object.values(IdentityAuthMethod).every((method) =>
              identity.authMethods.includes(method)
            ) && (
              <UnstableCardAction>
                <ProjectPermissionCan
                  I={ProjectPermissionIdentityActions.Edit}
                  a={subject(ProjectPermissionSub.Identity, {
                    identityId: identity.id
                  })}
                >
                  {(isAllowed) => (
                    <UnstableButton
                      variant="outline"
                      isFullWidth
                      size="xs"
                      isDisabled={!isAllowed}
                      onClick={() => {
                        handlePopUpOpen("identityAuthMethod", {
                          identityId: identity.id,
                          name: identity.name,
                          allAuthMethods: identity.authMethods
                        });
                      }}
                    >
                      <PlusIcon />
                      Add Auth Method
                    </UnstableButton>
                  )}
                </ProjectPermissionCan>
              </UnstableCardAction>
            )}
        </UnstableCardHeader>
        <UnstableCardContent>
          {identity.authMethods.length > 0 ? (
            <ViewIdentityAuth
              authMethods={identity.authMethods}
              identityId={identity.id}
              onResetAllLockouts={refetchIdentity}
              activeLockoutAuthMethods={identity.activeLockoutAuthMethods}
            />
          ) : (
            <UnstableEmpty className="border">
              <UnstableEmptyHeader>
                <UnstableEmptyTitle>
                  This machine identity has no auth methods configured
                </UnstableEmptyTitle>
                <UnstableEmptyDescription>
                  Add an auth method to use this machine identity
                </UnstableEmptyDescription>
              </UnstableEmptyHeader>
              <UnstableEmptyContent>
                <ProjectPermissionCan
                  I={ProjectPermissionIdentityActions.Edit}
                  a={subject(ProjectPermissionSub.Identity, {
                    identityId: identity.id
                  })}
                >
                  {(isAllowed) => (
                    <UnstableButton
                      variant="project"
                      size="xs"
                      isDisabled={!isAllowed}
                      onClick={() => {
                        handlePopUpOpen("identityAuthMethod", {
                          identityId: identity.id,
                          name: identity.name,
                          allAuthMethods: identity.authMethods
                        });
                      }}
                    >
                      <PlusIcon />
                      Add Auth Method
                    </UnstableButton>
                  )}
                </ProjectPermissionCan>
              </UnstableEmptyContent>
            </UnstableEmpty>
          )}
        </UnstableCardContent>
      </UnstableCard>
      <IdentityAuthMethodModal
        popUp={popUp}
        handlePopUpOpen={handlePopUpOpen}
        handlePopUpToggle={handlePopUpToggle}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={(popUp.upgradePlan?.data as { description: string })?.description}
        isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
      />
    </>
  );
};
