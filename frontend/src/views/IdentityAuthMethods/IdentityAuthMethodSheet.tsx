import { useEffect, useState } from "react";
import { subject } from "@casl/ability";
import { useParams } from "@tanstack/react-router";
import { LockIcon, Trash2Icon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { VariablePermissionCan } from "@app/components/permissions";
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
  Badge,
  Button,
  Field,
  FieldContent,
  FieldLabel,
  Input,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  OrgPermissionIdentityActions,
  OrgPermissionSubjects,
  ProjectPermissionIdentityActions,
  ProjectPermissionSub,
  useOrganization
} from "@app/context";
import { usePopUp, useScopeVariant } from "@app/hooks";
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
import { IdentityAuthMethodModal } from "@app/pages/organization/AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/IdentityAuthMethodModal";

import {
  IdentityAliCloudAuthContent,
  IdentityAwsAuthContent,
  IdentityAzureAuthContent,
  IdentityGcpAuthContent,
  IdentityJwtAuthContent,
  IdentityKubernetesAuthContent,
  IdentityLdapAuthContent,
  IdentityOciAuthContent,
  IdentityOidcAuthContent,
  IdentitySpiffeAuthContent,
  IdentityTlsCertAuthContent,
  IdentityTokenAuthContent,
  IdentityUniversalAuthContent
} from "./content";
import { ViewAuthMethodProps } from "./types";

const AuthMethodComponentMap: Record<
  IdentityAuthMethod,
  React.ComponentType<ViewAuthMethodProps>
> = {
  [IdentityAuthMethod.UNIVERSAL_AUTH]: IdentityUniversalAuthContent,
  [IdentityAuthMethod.TOKEN_AUTH]: IdentityTokenAuthContent,
  [IdentityAuthMethod.TLS_CERT_AUTH]: IdentityTlsCertAuthContent,
  [IdentityAuthMethod.KUBERNETES_AUTH]: IdentityKubernetesAuthContent,
  [IdentityAuthMethod.LDAP_AUTH]: IdentityLdapAuthContent,
  [IdentityAuthMethod.OCI_AUTH]: IdentityOciAuthContent,
  [IdentityAuthMethod.OIDC_AUTH]: IdentityOidcAuthContent,
  [IdentityAuthMethod.GCP_AUTH]: IdentityGcpAuthContent,
  [IdentityAuthMethod.AWS_AUTH]: IdentityAwsAuthContent,
  [IdentityAuthMethod.ALICLOUD_AUTH]: IdentityAliCloudAuthContent,
  [IdentityAuthMethod.AZURE_AUTH]: IdentityAzureAuthContent,
  [IdentityAuthMethod.JWT_AUTH]: IdentityJwtAuthContent,
  [IdentityAuthMethod.SPIFFE_AUTH]: IdentitySpiffeAuthContent
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  identityId: string;
  identityName: string;
  authMethod: IdentityAuthMethod;
  allAuthMethods: IdentityAuthMethod[];
  isLockedOut: boolean;
  onMutated: () => void;
};

type RevokeArgs = { identityId: string; projectId?: string; organizationId?: string };
type RevokeFn = (args: RevokeArgs) => Promise<unknown>;

export const IdentityAuthMethodSheet = ({
  open,
  onOpenChange,
  identityId,
  identityName,
  authMethod,
  allAuthMethods,
  isLockedOut,
  onMutated
}: Props) => {
  const { projectId } = useParams({ strict: false });
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const scopeVariant = useScopeVariant();

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "revokeAuthMethod",
    "identityAuthMethod",
    "upgradePlan"
  ] as const);

  const [removeConfirmInput, setRemoveConfirmInput] = useState("");
  const isRemoveDialogOpen = popUp.revokeAuthMethod.isOpen;

  useEffect(() => {
    if (!isRemoveDialogOpen) setRemoveConfirmInput("");
  }, [isRemoveDialogOpen]);

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
    if (!isRemoveConfirmed) return;

    await revokeMap[authMethod]({
      identityId,
      ...(projectId ? { projectId } : { organizationId: orgId })
    });

    createNotification({
      text: "Successfully removed auth method",
      type: "success"
    });
    handlePopUpToggle("revokeAuthMethod", false);
    onMutated();
    onOpenChange(false);
  };

  const Content = AuthMethodComponentMap[authMethod];

  const isEditOpen = Boolean(popUp.identityAuthMethod.isOpen);

  return (
    <>
      <Sheet open={open && !isEditOpen} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex flex-col sm:max-w-2xl">
          <SheetHeader className="border-b pr-12">
            <SheetTitle className="flex items-center gap-2">
              {identityAuthToNameMap[authMethod]}
              {isLockedOut && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge isSquare variant="danger">
                      <LockIcon />
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>Auth method has active lockouts</TooltipContent>
                </Tooltip>
              )}
            </SheetTitle>
          </SheetHeader>
          <div className="flex thin-scrollbar flex-1 flex-col overflow-y-auto p-4">
            <Content identityId={identityId} isLockedOut={isLockedOut} onMutated={onMutated} />
          </div>
          <SheetFooter className="border-t">
            <VariablePermissionCan
              type={projectId ? "project" : "org"}
              I={
                projectId
                  ? ProjectPermissionIdentityActions.Delete
                  : OrgPermissionIdentityActions.Delete
              }
              a={
                projectId
                  ? subject(ProjectPermissionSub.Identity, { identityId })
                  : OrgPermissionSubjects.Identity
              }
            >
              {(isAllowed) => (
                <Button
                  isDisabled={!isAllowed}
                  variant="danger"
                  onClick={() => handlePopUpOpen("revokeAuthMethod")}
                >
                  Remove
                </Button>
              )}
            </VariablePermissionCan>
            <VariablePermissionCan
              type={projectId ? "project" : "org"}
              I={
                projectId
                  ? ProjectPermissionIdentityActions.Edit
                  : OrgPermissionIdentityActions.Edit
              }
              a={
                projectId
                  ? subject(ProjectPermissionSub.Identity, { identityId })
                  : OrgPermissionSubjects.Identity
              }
            >
              {(isAllowed) => (
                <Button
                  isDisabled={!isAllowed}
                  variant={scopeVariant}
                  onClick={() =>
                    handlePopUpOpen("identityAuthMethod", {
                      identityId,
                      name: identityName,
                      allAuthMethods,
                      authMethod
                    })
                  }
                >
                  Edit
                </Button>
              )}
            </VariablePermissionCan>
          </SheetFooter>

          <AlertDialog
            open={isRemoveDialogOpen}
            onOpenChange={(isOpen) => handlePopUpToggle("revokeAuthMethod", isOpen)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogMedia>
                  <Trash2Icon />
                </AlertDialogMedia>
                <AlertDialogTitle>
                  Are you sure you want to remove {identityAuthToNameMap[authMethod]} on this
                  identity?
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
                    Type <span className="font-bold text-foreground">confirm</span> to perform this
                    action
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
        </SheetContent>
      </Sheet>
      <IdentityAuthMethodModal
        popUp={popUp}
        handlePopUpOpen={handlePopUpOpen}
        handlePopUpToggle={handlePopUpToggle}
      />
    </>
  );
};
