import { subject } from "@casl/ability";
import { DropdownMenu } from "@radix-ui/react-dropdown-menu";
import { EllipsisIcon, LockIcon, PlusIcon } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, Tooltip } from "@app/components/v2";
import {
  Badge,
  UnstableAccordion,
  UnstableAccordionContent,
  UnstableAccordionItem,
  UnstableAccordionTrigger,
  UnstableButton,
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
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
import { ViewIdentityAuthModal } from "@app/pages/organization/IdentityDetailsByIDPage/components/ViewIdentityAuthModal";

type Props = {
  identity: TProjectIdentity;
  refetchIdentity: () => void;
};

export const ProjectIdentityAuthenticationSection = ({ identity, refetchIdentity }: Props) => {
  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp([
    "viewAuthMethod",
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
            <>
              {/* <UnstableAccordion
                type={identity.authMethods.length === 1 ? "single" : "multiple"}
                collapsible
              >
                {identity.authMethods.map((authMethod) => (
                  <UnstableAccordionItem key={authMethod} value={authMethod}>
                    <UnstableAccordionTrigger>
                      {identityAuthToNameMap[authMethod]}
                      {identity.activeLockoutAuthMethods?.includes(authMethod) && (
                        <Tooltip content="Auth method has active lockouts">
                          <Badge isSquare variant="danger">
                            <LockIcon />
                          </Badge>
                        </Tooltip>
                      )}
                      <UnstableDropdownMenu>
                        <UnstableDropdownMenuTrigger asChild>
                          <UnstableIconButton variant="ghost" className="ml-auto" size="xs">
                            <EllipsisIcon />
                          </UnstableIconButton>
                        </UnstableDropdownMenuTrigger>
                        <UnstableDropdownMenuContent align="end">
                          <UnstableDropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePopUpOpen("revokeAuthMethod", authMethod);
                            }}
                            variant="danger"
                          >
                            Remove Auth Method
                          </UnstableDropdownMenuItem>
                        </UnstableDropdownMenuContent>
                      </UnstableDropdownMenu>
                    </UnstableAccordionTrigger>
                    <UnstableAccordionContent> */}
              <ViewIdentityAuthModal
                authMethods={identity.authMethods}
                lockedOut={popUp.viewAuthMethod.data?.lockedOut || false}
                identityId={identity.id}
                onResetAllLockouts={popUp.viewAuthMethod.data?.refetchIdentity}
                activeLockoutAuthMethods={identity.activeLockoutAuthMethods}
              />
              {/* </UnstableAccordionContent>
                  </UnstableAccordionItem>
                ))}
              </UnstableAccordion> */}
              {/* <UnstableTable>
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
                          lockedOut:
                            identity.activeLockoutAuthMethods?.includes(authMethod) ?? false,
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
              </UnstableTable> */}
            </>
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
      {/* <ViewIdentityAuthModal
        isOpen={popUp.viewAuthMethod.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("viewAuthMethod", isOpen)}
        authMethod={popUp.viewAuthMethod.data?.authMethod}
        lockedOut={popUp.viewAuthMethod.data?.lockedOut || false}
        identityId={identity.id}
        onResetAllLockouts={popUp.viewAuthMethod.data?.refetchIdentity}
      /> */}
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
