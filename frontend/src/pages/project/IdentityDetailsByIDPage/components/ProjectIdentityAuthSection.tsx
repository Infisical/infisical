import { subject } from "@casl/ability";
import { EllipsisIcon, LockIcon, PlusIcon } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Tooltip } from "@app/components/v2";
import {
  Badge,
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
  UnstableEmptyTitle,
  UnstableIconButton,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/context";
import { IdentityAuthMethod, identityAuthToNameMap, TProjectIdentity } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";
import { IdentityAuthMethodModal } from "@app/pages/organization/AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/IdentityAuthMethodModal";
import { ViewIdentityAuthModal } from "@app/pages/organization/IdentityDetailsByIDPage/components/ViewIdentityAuthModal";

type Props = {
  identity: TProjectIdentity;
  refetchIdentity: () => void;
};

export const ProjectIdentityAuthenticationSection = ({ identity, refetchIdentity }: Props) => {
  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp([
    "viewAuthMethod",
    "identityAuthMethod",
    "upgradePlan"
  ]);

  const hasAuthMethods = Boolean(identity.authMethods.length);

  return (
    <>
      <UnstableCard>
        <UnstableCardHeader className="border-b">
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
                      variant="project"
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
            <UnstableTable>
              <UnstableTableHeader>
                <UnstableTableHead className="w-full">Method</UnstableTableHead>
                <UnstableTableHead className="w-5" />
              </UnstableTableHeader>
              <UnstableTableBody>
                {identity.authMethods.map((authMethod) => (
                  <UnstableTableRow
                    key={authMethod}
                    className="cursor-pointer"
                    onClick={() =>
                      handlePopUpOpen("viewAuthMethod", {
                        authMethod,
                        lockedOut: identity.activeLockoutAuthMethods?.includes(authMethod) ?? false,
                        refetchIdentity
                      })
                    }
                  >
                    <UnstableTableCell>{identityAuthToNameMap[authMethod]}</UnstableTableCell>
                    <UnstableTableCell>
                      <div className="flex items-center gap-2">
                        {identity.activeLockoutAuthMethods?.includes(authMethod) && (
                          <Tooltip content="Auth method has active lockouts">
                            <Badge isSquare variant="danger">
                              <LockIcon />
                            </Badge>
                          </Tooltip>
                        )}
                        <UnstableIconButton variant="ghost" size="xs">
                          <EllipsisIcon />
                        </UnstableIconButton>
                      </div>
                    </UnstableTableCell>
                  </UnstableTableRow>
                ))}
              </UnstableTableBody>
            </UnstableTable>
          ) : (
            <UnstableEmpty className="rounded-sm border bg-mineshaft-800/50">
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
      <ViewIdentityAuthModal
        isOpen={popUp.viewAuthMethod.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("viewAuthMethod", isOpen)}
        authMethod={popUp.viewAuthMethod.data?.authMethod}
        lockedOut={popUp.viewAuthMethod.data?.lockedOut || false}
        identityId={identity.id}
        onResetAllLockouts={popUp.viewAuthMethod.data?.refetchIdentity}
      />
    </>
  );
};
