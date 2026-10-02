import { useState } from "react";
import { useParams } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogConfirmationField,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v3";
import { useOrganization } from "@app/context";
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
  useDeleteIdentitySpiffeAuth,
  useDeleteIdentityTlsCertAuth,
  useDeleteIdentityTokenAuth,
  useDeleteIdentityUniversalAuth
} from "@app/hooks/api";

type RevokeArgs = { identityId: string; projectId?: string; organizationId?: string };
type RevokeFn = (args: RevokeArgs) => Promise<unknown>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  identityId: string;
  identityName?: string;
  authMethod: IdentityAuthMethod | null;
  onSuccess: () => void;
};

export const IdentityAuthRevokeDialog = ({
  open,
  onOpenChange,
  identityId,
  identityName,
  authMethod,
  onSuccess
}: Props) => {
  const { projectId } = useParams({ strict: false });
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";

  const [isRemoving, setIsRemoving] = useState(false);

  const { mutateAsync: revokeUniversal } = useDeleteIdentityUniversalAuth();
  const { mutateAsync: revokeToken } = useDeleteIdentityTokenAuth();
  const { mutateAsync: revokeKubernetes } = useDeleteIdentityKubernetesAuth();
  const { mutateAsync: revokeGcp } = useDeleteIdentityGcpAuth();
  const { mutateAsync: revokeTlsCert } = useDeleteIdentityTlsCertAuth();
  const { mutateAsync: revokeAws } = useDeleteIdentityAwsAuth();
  const { mutateAsync: revokeAzure } = useDeleteIdentityAzureAuth();
  const { mutateAsync: revokeAliCloud } = useDeleteIdentityAliCloudAuth();
  const { mutateAsync: revokeOci } = useDeleteIdentityOciAuth();
  const { mutateAsync: revokeOidc } = useDeleteIdentityOidcAuth();
  const { mutateAsync: revokeJwt } = useDeleteIdentityJwtAuth();
  const { mutateAsync: revokeSpiffe } = useDeleteIdentitySpiffeAuth();
  const { mutateAsync: revokeLdap } = useDeleteIdentityLdapAuth();

  const revokeMap: Record<IdentityAuthMethod, RevokeFn> = {
    [IdentityAuthMethod.UNIVERSAL_AUTH]: revokeUniversal as RevokeFn,
    [IdentityAuthMethod.TOKEN_AUTH]: revokeToken as RevokeFn,
    [IdentityAuthMethod.KUBERNETES_AUTH]: revokeKubernetes as RevokeFn,
    [IdentityAuthMethod.GCP_AUTH]: revokeGcp as RevokeFn,
    [IdentityAuthMethod.TLS_CERT_AUTH]: revokeTlsCert as RevokeFn,
    [IdentityAuthMethod.AWS_AUTH]: revokeAws as RevokeFn,
    [IdentityAuthMethod.AZURE_AUTH]: revokeAzure as RevokeFn,
    [IdentityAuthMethod.ALICLOUD_AUTH]: revokeAliCloud as RevokeFn,
    [IdentityAuthMethod.OCI_AUTH]: revokeOci as RevokeFn,
    [IdentityAuthMethod.OIDC_AUTH]: revokeOidc as RevokeFn,
    [IdentityAuthMethod.JWT_AUTH]: revokeJwt as RevokeFn,
    [IdentityAuthMethod.SPIFFE_AUTH]: revokeSpiffe as RevokeFn,
    [IdentityAuthMethod.LDAP_AUTH]: revokeLdap as RevokeFn
  };

  const authMethodName = authMethod ? identityAuthToNameMap[authMethod] : "this auth method";

  const handleDelete = async () => {
    if (!authMethod || isRemoving) return;

    setIsRemoving(true);
    try {
      await revokeMap[authMethod]({
        identityId,
        ...(projectId ? { projectId } : { organizationId: orgId })
      });

      createNotification({
        text: "Successfully removed auth method",
        type: "success"
      });
      onOpenChange(false);
      onSuccess();
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      confirmationValue="confirm"
      onOpenChange={(isOpen) => {
        if (!isOpen && isRemoving) return;
        onOpenChange(isOpen);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Auth Method</AlertDialogTitle>
          <AlertDialogDescription>
            Remove <span className="font-medium text-foreground">{authMethodName}</span> from{" "}
            <span className="font-medium text-foreground">{identityName ?? "this identity"}</span>.
            Clients using this method can no longer authenticate as this identity, and its
            configuration and issued credentials are deleted. The method can be configured again
            later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogConfirmationField
          inputProps={{ disabled: isRemoving }}
          onConfirm={() => handleDelete().catch(() => undefined)}
        />
        <AlertDialogFooter>
          <AlertDialogCancel isDisabled={isRemoving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            isPending={isRemoving}
            onClick={(event) => {
              event.preventDefault();
              handleDelete().catch(() => undefined);
            }}
          >
            Remove Auth Method
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
