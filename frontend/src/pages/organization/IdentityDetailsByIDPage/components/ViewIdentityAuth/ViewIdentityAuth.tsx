import { subject } from "@casl/ability";
import { useParams } from "@tanstack/react-router";
import { EllipsisIcon, LockIcon } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { VariablePermissionCan } from "@app/components/permissions";
import { DeleteActionModal, Modal, ModalContent, Tooltip } from "@app/components/v2";
import {
  Badge,
  UnstableAccordion,
  UnstableAccordionContent,
  UnstableAccordionItem,
  UnstableAccordionTrigger,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableIconButton
} from "@app/components/v3";
import {
  OrgPermissionIdentityActions,
  OrgPermissionSubjects,
  ProjectPermissionIdentityActions,
  ProjectPermissionSub,
  useOrganization
} from "@app/context";
import { usePopUp } from "@app/hooks";
import {
  IdentityAuthMethod,
  identityAuthToNameMap,
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
import { IdentityAliCloudAuthForm } from "@app/pages/organization/AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/IdentityAliCloudAuthForm";
import { IdentityAwsAuthForm } from "@app/pages/organization/AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/IdentityAwsAuthForm";
import { IdentityAzureAuthForm } from "@app/pages/organization/AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/IdentityAzureAuthForm";
import { IdentityGcpAuthForm } from "@app/pages/organization/AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/IdentityGcpAuthForm";
import { IdentityJwtAuthForm } from "@app/pages/organization/AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/IdentityJwtAuthForm";
import { IdentityKubernetesAuthForm } from "@app/pages/organization/AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/IdentityKubernetesAuthForm";
import { IdentityLdapAuthForm } from "@app/pages/organization/AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/IdentityLdapAuthForm";
import { IdentityOciAuthForm } from "@app/pages/organization/AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/IdentityOciAuthForm";
import { IdentityOidcAuthForm } from "@app/pages/organization/AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/IdentityOidcAuthForm";
import { IdentityTlsCertAuthForm } from "@app/pages/organization/AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/IdentityTlsCertAuthForm";
import { IdentityTokenAuthForm } from "@app/pages/organization/AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/IdentityTokenAuthForm";
import { IdentityUniversalAuthForm } from "@app/pages/organization/AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/IdentityUniversalAuthForm";

import { ViewIdentityAliCloudAuthContent } from "./ViewIdentityAliCloudAuthContent";
import { ViewIdentityAwsAuthContent } from "./ViewIdentityAwsAuthContent";
import { ViewIdentityAzureAuthContent } from "./ViewIdentityAzureAuthContent";
import { ViewIdentityGcpAuthContent } from "./ViewIdentityGcpAuthContent";
import { ViewIdentityJwtAuthContent } from "./ViewIdentityJwtAuthContent";
import { ViewIdentityKubernetesAuthContent } from "./ViewIdentityKubernetesAuthContent";
import { ViewIdentityLdapAuthContent } from "./ViewIdentityLdapAuthContent";
import { ViewIdentityOciAuthContent } from "./ViewIdentityOciAuthContent";
import { ViewIdentityOidcAuthContent } from "./ViewIdentityOidcAuthContent";
import { ViewIdentityTlsCertAuthContent } from "./ViewIdentityTlsCertAuthContent";
import { ViewIdentityTokenAuthContent } from "./ViewIdentityTokenAuthContent";
import { ViewIdentityUniversalAuthContent } from "./ViewIdentityUniversalAuthContent";

type Props = {
  identityId: string;
  authMethods: IdentityAuthMethod[];
  onResetAllLockouts: () => void;
  activeLockoutAuthMethods: IdentityAuthMethod[];
};

const AuthMethodComponentMap = {
  [IdentityAuthMethod.UNIVERSAL_AUTH]: ViewIdentityUniversalAuthContent,
  [IdentityAuthMethod.TOKEN_AUTH]: ViewIdentityTokenAuthContent,
  [IdentityAuthMethod.TLS_CERT_AUTH]: ViewIdentityTlsCertAuthContent,
  [IdentityAuthMethod.KUBERNETES_AUTH]: ViewIdentityKubernetesAuthContent,
  [IdentityAuthMethod.LDAP_AUTH]: ViewIdentityLdapAuthContent,
  [IdentityAuthMethod.OCI_AUTH]: ViewIdentityOciAuthContent,
  [IdentityAuthMethod.OIDC_AUTH]: ViewIdentityOidcAuthContent,
  [IdentityAuthMethod.GCP_AUTH]: ViewIdentityGcpAuthContent,
  [IdentityAuthMethod.AWS_AUTH]: ViewIdentityAwsAuthContent,
  [IdentityAuthMethod.ALICLOUD_AUTH]: ViewIdentityAliCloudAuthContent,
  [IdentityAuthMethod.AZURE_AUTH]: ViewIdentityAzureAuthContent,
  [IdentityAuthMethod.JWT_AUTH]: ViewIdentityJwtAuthContent
};

const EditAuthMethodMap = {
  [IdentityAuthMethod.KUBERNETES_AUTH]: IdentityKubernetesAuthForm,
  [IdentityAuthMethod.GCP_AUTH]: IdentityGcpAuthForm,
  [IdentityAuthMethod.TLS_CERT_AUTH]: IdentityTlsCertAuthForm,
  [IdentityAuthMethod.AWS_AUTH]: IdentityAwsAuthForm,
  [IdentityAuthMethod.AZURE_AUTH]: IdentityAzureAuthForm,
  [IdentityAuthMethod.ALICLOUD_AUTH]: IdentityAliCloudAuthForm,
  [IdentityAuthMethod.UNIVERSAL_AUTH]: IdentityUniversalAuthForm,
  [IdentityAuthMethod.TOKEN_AUTH]: IdentityTokenAuthForm,
  [IdentityAuthMethod.OCI_AUTH]: IdentityOciAuthForm,
  [IdentityAuthMethod.OIDC_AUTH]: IdentityOidcAuthForm,
  [IdentityAuthMethod.JWT_AUTH]: IdentityJwtAuthForm,
  [IdentityAuthMethod.LDAP_AUTH]: IdentityLdapAuthForm
};

export const Content = ({
  identityId,
  authMethods,
  onResetAllLockouts,
  activeLockoutAuthMethods
}: Pick<
  Props,
  "authMethods" | "identityId" | "onResetAllLockouts" | "activeLockoutAuthMethods"
>) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { projectId } = useParams({
    strict: false
  });
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "revokeAuthMethod",
    "identityAuthMethod",
    "upgradePlan"
  ] as const);

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

  const RemoveAuthMethodMap = {
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
    await RemoveAuthMethodMap[authMethod]({
      identityId,
      ...(projectId
        ? { projectId }
        : {
            organizationId: orgId
          })
    });

    createNotification({
      text: "Successfully removed auth method",
      type: "success"
    });
    handlePopUpToggle("revokeAuthMethod", false);
  };

  const EditForm = popUp.identityAuthMethod?.data
    ? EditAuthMethodMap[popUp.identityAuthMethod.data as IdentityAuthMethod]
    : null;

  return (
    <>
      <UnstableAccordion type={authMethods.length === 1 ? "single" : "multiple"} collapsible>
        {authMethods.map((authMethod) => {
          const Component = AuthMethodComponentMap[authMethod];

          return (
            <UnstableAccordionItem key={authMethod} value={authMethod}>
              <UnstableAccordionTrigger>
                <span className="mr-auto">{identityAuthToNameMap[authMethod]}</span>
                {activeLockoutAuthMethods?.includes(authMethod) && (
                  <Tooltip content="Auth method has active lockouts">
                    <Badge isSquare variant="danger">
                      <LockIcon />
                    </Badge>
                  </Tooltip>
                )}
                <UnstableDropdownMenu>
                  <UnstableDropdownMenuTrigger asChild>
                    <UnstableIconButton variant="ghost" size="xs">
                      <EllipsisIcon />
                    </UnstableIconButton>
                  </UnstableDropdownMenuTrigger>
                  <UnstableDropdownMenuContent align="end">
                    <VariablePermissionCan
                      type={projectId ? "project" : "org"}
                      I={
                        projectId
                          ? ProjectPermissionIdentityActions.Edit
                          : OrgPermissionIdentityActions.Edit
                      }
                      a={
                        projectId
                          ? subject(ProjectPermissionSub.Identity, {
                              identityId
                            })
                          : OrgPermissionSubjects.Identity
                      }
                    >
                      {(isAllowed) => (
                        <UnstableDropdownMenuItem
                          isDisabled={!isAllowed}
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePopUpOpen("identityAuthMethod", authMethod);
                          }}
                        >
                          Edit Auth Method
                        </UnstableDropdownMenuItem>
                      )}
                    </VariablePermissionCan>
                    <VariablePermissionCan
                      type={projectId ? "project" : "org"}
                      I={
                        projectId
                          ? ProjectPermissionIdentityActions.Delete
                          : OrgPermissionIdentityActions.Delete
                      }
                      a={
                        projectId
                          ? subject(ProjectPermissionSub.Identity, {
                              identityId
                            })
                          : OrgPermissionSubjects.Identity
                      }
                    >
                      {(isAllowed) => (
                        <UnstableDropdownMenuItem
                          isDisabled={!isAllowed}
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePopUpOpen("revokeAuthMethod", authMethod);
                          }}
                          variant="danger"
                        >
                          Remove Auth Method
                        </UnstableDropdownMenuItem>
                      )}
                    </VariablePermissionCan>
                  </UnstableDropdownMenuContent>
                </UnstableDropdownMenu>
              </UnstableAccordionTrigger>
              <UnstableAccordionContent>
                <Component
                  identityId={identityId}
                  onEdit={() => handlePopUpOpen("identityAuthMethod", authMethod)}
                  onDelete={() => handlePopUpOpen("revokeAuthMethod", authMethod)}
                  onResetAllLockouts={onResetAllLockouts}
                  lockedOut={activeLockoutAuthMethods?.includes(authMethod)}
                />
              </UnstableAccordionContent>
            </UnstableAccordionItem>
          );
        })}
      </UnstableAccordion>
      <DeleteActionModal
        isOpen={popUp?.revokeAuthMethod?.isOpen}
        title={`Are you sure you want to remove ${popUp?.revokeAuthMethod?.data ? identityAuthToNameMap[popUp?.revokeAuthMethod?.data as IdentityAuthMethod] : "this auth method"} on this identity?`}
        onChange={(isOpen) => handlePopUpToggle("revokeAuthMethod", isOpen)}
        deleteKey="confirm"
        buttonText="Remove"
        onDeleteApproved={() =>
          handleDeleteAuthMethod(popUp?.revokeAuthMethod?.data as IdentityAuthMethod)
        }
      />
      <Modal
        isOpen={popUp?.identityAuthMethod?.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("identityAuthMethod", isOpen)}
      >
        <ModalContent
          title={`Edit ${popUp?.identityAuthMethod?.data ? identityAuthToNameMap[popUp?.identityAuthMethod?.data as IdentityAuthMethod] : "this auth method"}`}
        >
          {EditForm && (
            <EditForm
              identityId={identityId}
              isUpdate
              handlePopUpOpen={handlePopUpOpen}
              handlePopUpToggle={handlePopUpToggle}
            />
          )}
        </ModalContent>
      </Modal>
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={`Your current plan does not include access to ${popUp.upgradePlan.data?.featureName}. To unlock this feature, please upgrade to Infisical ${popUp.upgradePlan.data?.isEnterpriseFeature ? "Enterprise" : "Pro"} plan.`}
      />
    </>
  );
};

export const ViewIdentityAuth = ({
  authMethods,
  identityId,
  onResetAllLockouts,
  activeLockoutAuthMethods
}: Props) => {
  return (
    <Content
      identityId={identityId}
      authMethods={authMethods}
      activeLockoutAuthMethods={activeLockoutAuthMethods}
      onResetAllLockouts={() => onResetAllLockouts()}
    />
  );
};
