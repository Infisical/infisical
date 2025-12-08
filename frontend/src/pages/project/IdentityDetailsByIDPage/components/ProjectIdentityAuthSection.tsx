import { subject } from "@casl/ability";
import { PlusIcon } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
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
import {
  IdentityAuthMethod,
  identityAuthToNameMap,
  TProjectIdentity,
  useDeleteIdentityAliCloudAuth,
  useDeleteIdentityAwsAuth,
  useDeleteIdentityAzureAuth,
  useDeleteIdentityGcpAuth,
  useDeleteIdentityJwtAuth,
  useDeleteIdentityKubernetesAuth,
  useDeleteIdentityLdapAuth,
  useDeleteIdentityOciAuth,
  useDeleteIdentityOidcAuth,
  useDeleteIdentityTlsCertAuth,
  useDeleteIdentityTokenAuth,
  useDeleteIdentityUniversalAuth
} from "@app/hooks/api";
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

  const { mutateAsync: revokeUniversalAuth } = useDeleteIdentityUniversalAuth();
  const { mutateAsync: revokeTokenAuth } = useDeleteIdentityTokenAuth();
  const { mutateAsync: revokeKubernetesAuth } = useDeleteIdentityKubernetesAuth();
  const { mutateAsync: revokeGcpAuth } = useDeleteIdentityGcpAuth();
  const { mutateAsync: revokeTlsCertAuth } = useDeleteIdentityTlsCertAuth();
  const { mutateAsync: revokeAwsAuth } = useDeleteIdentityAwsAuth();
  const { mutateAsync: revokeAzureAuth } = useDeleteIdentityAzureAuth();
  const { mutateAsync: revokeAliCloudAuth } = useDeleteIdentityAliCloudAuth();
  const { mutateAsync: revokeOciAuth } = useDeleteIdentityOciAuth();
  const { mutateAsync: revokeOidcAuth } = useDeleteIdentityOidcAuth();
  const { mutateAsync: revokeJwtAuth } = useDeleteIdentityJwtAuth();
  const { mutateAsync: revokeLdapAuth } = useDeleteIdentityLdapAuth();

  const RemoveAuthMap = {
    [IdentityAuthMethod.KUBERNETES_AUTH]: revokeKubernetesAuth,
    [IdentityAuthMethod.GCP_AUTH]: revokeGcpAuth,
    [IdentityAuthMethod.TLS_CERT_AUTH]: revokeTlsCertAuth,
    [IdentityAuthMethod.AWS_AUTH]: revokeAwsAuth,
    [IdentityAuthMethod.AZURE_AUTH]: revokeAzureAuth,
    [IdentityAuthMethod.ALICLOUD_AUTH]: revokeAliCloudAuth,
    [IdentityAuthMethod.UNIVERSAL_AUTH]: revokeUniversalAuth,
    [IdentityAuthMethod.TOKEN_AUTH]: revokeTokenAuth,
    [IdentityAuthMethod.OCI_AUTH]: revokeOciAuth,
    [IdentityAuthMethod.OIDC_AUTH]: revokeOidcAuth,
    [IdentityAuthMethod.JWT_AUTH]: revokeJwtAuth,
    [IdentityAuthMethod.LDAP_AUTH]: revokeLdapAuth
  };

  const handleDeleteAuthMethod = async (authMethod: IdentityAuthMethod) => {
    await RemoveAuthMap[authMethod]({
      identityId: identity.id,
      projectId: identity.projectId!
    });

    createNotification({
      text: "Successfully removed auth method",
      type: "success"
    });
    handlePopUpToggle("revokeAuthMethod", false);
  };

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
      <DeleteActionModal
        isOpen={popUp?.revokeAuthMethod?.isOpen}
        title={`Are you sure you want to remove ${popUp?.revokeAuthMethod?.data ? identityAuthToNameMap[popUp.revokeAuthMethod.data as IdentityAuthMethod] : "this auth method"} on this identity?`}
        onChange={(isOpen) => handlePopUpToggle("revokeAuthMethod", isOpen)}
        deleteKey="confirm"
        buttonText="Remove"
        onDeleteApproved={() =>
          handleDeleteAuthMethod(popUp.revokeAuthMethod.data as IdentityAuthMethod)
        }
      />
    </>
  );
};
