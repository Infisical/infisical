import { useEffect, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { Trash2Icon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Field,
  FieldContent,
  FieldLabel,
  Input
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
  authMethod: IdentityAuthMethod | null;
  onSuccess: () => void;
};

export const IdentityAuthRevokeDialog = ({
  open,
  onOpenChange,
  identityId,
  authMethod,
  onSuccess
}: Props) => {
  const { projectId } = useParams({ strict: false });
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";

  const [removeConfirmInput, setRemoveConfirmInput] = useState("");

  useEffect(() => {
    if (!open) setRemoveConfirmInput("");
  }, [open]);

  const isRemoveConfirmed = removeConfirmInput === "confirm";

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

  const handleDelete = async () => {
    if (!authMethod || !isRemoveConfirmed) return;

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
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>
            Are you sure you want to remove{" "}
            {authMethod ? identityAuthToNameMap[authMethod] : "this auth method"} on this identity?
          </AlertDialogTitle>
          <AlertDialogDescription>This action is irreversible.</AlertDialogDescription>
        </AlertDialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleDelete();
          }}
        >
          <Field>
            <FieldLabel htmlFor="remove-auth-confirm">
              Type <span className="font-bold text-foreground">confirm</span> to perform this action
            </FieldLabel>
            <FieldContent>
              <Input
                id="remove-auth-confirm"
                value={removeConfirmInput}
                onChange={(e) => setRemoveConfirmInput(e.target.value)}
                placeholder="Type confirm here"
                autoComplete="off"
              />
            </FieldContent>
          </Field>
        </form>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            onClick={handleDelete}
            isDisabled={!isRemoveConfirmed}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
