import { subject } from "@casl/ability";
import { useParams } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { VariablePermissionCan } from "@app/components/permissions";
import { Button } from "@app/components/v3";
import {
  OrgPermissionIdentityActions,
  OrgPermissionSubjects,
  ProjectPermissionIdentityActions,
  ProjectPermissionSub
} from "@app/context";
import {
  IdentityAuthMethod,
  useClearIdentityLdapAuthLockouts,
  useClearIdentityUniversalAuthLockouts
} from "@app/hooks/api";

type Props = {
  identityId: string;
  authMethod: IdentityAuthMethod;
  onSuccess: () => void;
};

export const ResetLockoutsButton = ({ identityId, authMethod, onSuccess }: Props) => {
  const universal = useClearIdentityUniversalAuthLockouts();
  const ldap = useClearIdentityLdapAuthLockouts();

  const { projectId } = useParams({ strict: false });

  let mutation: typeof universal | typeof ldap | null = null;
  if (authMethod === IdentityAuthMethod.UNIVERSAL_AUTH) mutation = universal;
  else if (authMethod === IdentityAuthMethod.LDAP_AUTH) mutation = ldap;

  if (!mutation) return null;

  const { mutateAsync, isPending } = mutation;

  const handleClear = async () => {
    const deleted = await mutateAsync({ identityId });
    createNotification({
      text: `Successfully cleared ${deleted} lockout${deleted === 1 ? "" : "s"}`,
      type: "success"
    });
    onSuccess();
  };

  return (
    <VariablePermissionCan
      type={projectId ? "project" : "org"}
      I={projectId ? ProjectPermissionIdentityActions.Edit : OrgPermissionIdentityActions.Edit}
      a={
        projectId
          ? subject(ProjectPermissionSub.Identity, { identityId })
          : OrgPermissionSubjects.Identity
      }
    >
      {(isAllowed) => (
        <Button
          variant="danger"
          size="xs"
          isDisabled={!isAllowed}
          onClick={handleClear}
          isPending={isPending}
        >
          Reset All Lockouts
        </Button>
      )}
    </VariablePermissionCan>
  );
};
