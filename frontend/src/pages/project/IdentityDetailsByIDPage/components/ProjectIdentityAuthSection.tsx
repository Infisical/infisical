import { subject } from "@casl/ability";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { LockIcon, SettingsIcon } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, Tooltip } from "@app/components/v2";
import { Badge } from "@app/components/v3";
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

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-medium text-mineshaft-100">Authentication</h3>
      </div>
      {identity.authMethods.length > 0 ? (
        <div className="flex flex-col divide-y divide-mineshaft-400/50">
          {identity.authMethods.map((authMethod) => (
            <button
              key={authMethod}
              onClick={() =>
                handlePopUpOpen("viewAuthMethod", {
                  authMethod,
                  lockedOut: identity.activeLockoutAuthMethods?.includes(authMethod) ?? false,
                  refetchIdentity
                })
              }
              type="button"
              className="flex w-full items-center justify-between bg-mineshaft-900 px-4 py-2 text-sm hover:bg-mineshaft-700 data-[state=open]:bg-mineshaft-600"
            >
              <span>{identityAuthToNameMap[authMethod]}</span>
              <div className="flex items-center gap-2">
                {identity.activeLockoutAuthMethods?.includes(authMethod) && (
                  <Tooltip content="Auth method has active lockouts">
                    <Badge isSquare variant="danger">
                      <LockIcon />
                    </Badge>
                  </Tooltip>
                )}
                <SettingsIcon className="size-4 text-neutral" />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="w-full space-y-2 pt-2">
          <p className="text-sm text-mineshaft-300">
            No authentication methods configured. Get started by creating a new auth method.
          </p>
        </div>
      )}
      {!Object.values(IdentityAuthMethod).every((method) =>
        identity.authMethods.includes(method)
      ) && (
        <ProjectPermissionCan
          I={ProjectPermissionIdentityActions.Edit}
          a={subject(ProjectPermissionSub.Identity, {
            identityId: identity.id
          })}
        >
          {(isAllowed) => (
            <Button
              isDisabled={!isAllowed}
              onClick={() => {
                handlePopUpOpen("identityAuthMethod", {
                  identityId: identity.id,
                  name: identity.name,
                  allAuthMethods: identity.authMethods
                });
              }}
              variant="outline_bg"
              className="mt-3 w-full"
              size="xs"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
            >
              {identity.authMethods.length ? "Add" : "Create"} Auth Method
            </Button>
          )}
        </ProjectPermissionCan>
      )}
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
    </div>
  );
};
