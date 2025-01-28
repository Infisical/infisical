import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { DeleteActionModal, Modal, ModalContent } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { usePopUp } from "@app/hooks";
import {
  IdentityAuthMethod,
  identityAuthToNameMap,
  useDeleteIdentityAwsAuth,
  useDeleteIdentityAzureAuth,
  useDeleteIdentityGcpAuth,
  useDeleteIdentityJwtAuth,
  useDeleteIdentityKubernetesAuth,
  useDeleteIdentityOidcAuth,
  useDeleteIdentityTokenAuth,
  useDeleteIdentityUniversalAuth
} from "@app/hooks/api";

import { ViewAuthMethodProps } from "./types";
import { ViewIdentityAwsAuthContent } from "./ViewIdentityAwsAuthContent";
import { ViewIdentityAzureAuthContent } from "./ViewIdentityAzureAuthContent";
import { ViewIdentityGcpAuthContent } from "./ViewIdentityGcpAuthContent";
import { ViewIdentityJwtAuthContent } from "./ViewIdentityJwtAuthContent";
import { ViewIdentityKubernetesAuthContent } from "./ViewIdentityKubernetesAuthContent";
import { ViewIdentityOidcAuthContent } from "./ViewIdentityOidcAuthContent";
import { ViewIdentityTokenAuthContent } from "./ViewIdentityTokenAuthContent";
import { ViewIdentityUniversalAuthContent } from "./ViewIdentityUniversalAuthContent";

type Props = {
  identityId: string;
  authMethod?: IdentityAuthMethod;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onDeleteAuthMethod: () => void;
};

type TRevokeOptions = {
  identityId: string;
  organizationId: string;
};

export const Content = ({
  identityId,
  authMethod,
  onDeleteAuthMethod
}: Pick<Props, "authMethod" | "identityId" | "onDeleteAuthMethod">) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "revokeAuthMethod",
    "upgradePlan",
    "identityAuthMethod"
  ] as const);

  const { mutateAsync: revokeUniversalAuth } = useDeleteIdentityUniversalAuth();
  const { mutateAsync: revokeTokenAuth } = useDeleteIdentityTokenAuth();
  const { mutateAsync: revokeKubernetesAuth } = useDeleteIdentityKubernetesAuth();
  const { mutateAsync: revokeGcpAuth } = useDeleteIdentityGcpAuth();
  const { mutateAsync: revokeAwsAuth } = useDeleteIdentityAwsAuth();
  const { mutateAsync: revokeAzureAuth } = useDeleteIdentityAzureAuth();
  const { mutateAsync: revokeOidcAuth } = useDeleteIdentityOidcAuth();
  const { mutateAsync: revokeJwtAuth } = useDeleteIdentityJwtAuth();

  let Component: (props: ViewAuthMethodProps) => JSX.Element;
  let revokeMethod: (revokeOptions: TRevokeOptions) => Promise<any>;

  const handleDelete = () => handlePopUpOpen("revokeAuthMethod");

  switch (authMethod) {
    case IdentityAuthMethod.UNIVERSAL_AUTH:
      revokeMethod = revokeUniversalAuth;
      Component = ViewIdentityUniversalAuthContent;
      break;
    case IdentityAuthMethod.TOKEN_AUTH:
      revokeMethod = revokeTokenAuth;
      Component = ViewIdentityTokenAuthContent;
      break;
    case IdentityAuthMethod.KUBERNETES_AUTH:
      revokeMethod = revokeKubernetesAuth;
      Component = ViewIdentityKubernetesAuthContent;
      break;
    case IdentityAuthMethod.GCP_AUTH:
      revokeMethod = revokeGcpAuth;
      Component = ViewIdentityGcpAuthContent;
      break;
    case IdentityAuthMethod.AWS_AUTH:
      revokeMethod = revokeAwsAuth;
      Component = ViewIdentityAwsAuthContent;
      break;
    case IdentityAuthMethod.AZURE_AUTH:
      revokeMethod = revokeAzureAuth;
      Component = ViewIdentityAzureAuthContent;
      break;
    case IdentityAuthMethod.OIDC_AUTH:
      revokeMethod = revokeOidcAuth;
      Component = ViewIdentityOidcAuthContent;
      break;
    case IdentityAuthMethod.JWT_AUTH:
      revokeMethod = revokeJwtAuth;
      Component = ViewIdentityJwtAuthContent;
      break;
    default:
      throw new Error(`Unhandled Auth Method: ${authMethod}`);
  }

  const handleDeleteAuthMethod = async () => {
    try {
      await revokeMethod({
        identityId,
        organizationId: orgId
      });

      createNotification({
        text: "Successfully removed auth method",
        type: "success"
      });

      handlePopUpToggle("revokeAuthMethod", false);
      onDeleteAuthMethod();
    } catch {
      createNotification({
        text: "Failed to remove auth method",
        type: "error"
      });
    }
  };

  return (
    <>
      <Component
        identityId={identityId}
        onDelete={handleDelete}
        popUp={popUp}
        handlePopUpOpen={handlePopUpOpen}
        handlePopUpToggle={handlePopUpToggle}
      />
      <DeleteActionModal
        isOpen={popUp?.revokeAuthMethod?.isOpen}
        title={`Are you sure want to remove ${identityAuthToNameMap[authMethod]} on this identity?`}
        onChange={(isOpen) => handlePopUpToggle("revokeAuthMethod", isOpen)}
        deleteKey="confirm"
        buttonText="Remove"
        onDeleteApproved={handleDeleteAuthMethod}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={(popUp.upgradePlan?.data as { description: string })?.description}
      />
    </>
  );
};

export const ViewIdentityAuthModal = ({
  isOpen,
  onOpenChange,
  authMethod,
  identityId
}: Omit<Props, "onDeleteAuthMethod">) => {
  if (!identityId || !authMethod) return null;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-2xl" title={identityAuthToNameMap[authMethod]}>
        <Content
          identityId={identityId}
          authMethod={authMethod}
          onDeleteAuthMethod={() => onOpenChange(false)}
        />
      </ModalContent>
    </Modal>
  );
};
