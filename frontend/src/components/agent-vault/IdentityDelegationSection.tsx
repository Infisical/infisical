import { useState } from "react";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DeleteConfirmDialog,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  DocumentationLinkBadge,
  Skeleton
} from "@app/components/v3";
import { useProjectPermission } from "@app/context";
import {
  useDeleteAgentVaultDelegation,
  useListAgentVaultDelegations
} from "@app/hooks/api/agentVault";
import { AgentVaultDelegationScope, AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { AgentVaultDocsUrls } from "@app/pages/agent-vault/agent-vault-docs-urls";

import { DelegationDialog } from "./DelegationDialog";
import { MEMBER_KIND, memberDisplayName } from "./MemberName";

type Props = {
  machineIdentityId: string;
  machineIdentityName: string;
};

// Only admins can read or change a delegation, so members don't see the section at all.
export const IdentityDelegationSection = ({ machineIdentityId, machineIdentityName }: Props) => {
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  const { data: delegations, isPending } = useListAgentVaultDelegations(
    [machineIdentityId],
    isAdmin
  );
  const delegation = delegations?.[0] ?? null;
  const deleteDelegation = useDeleteAgentVaultDelegation();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isRemoveOpen, setIsRemoveOpen] = useState(false);

  if (!isAdmin) return null;

  const handleRemove = async () => {
    try {
      await deleteDelegation.mutateAsync({ machineIdentityId });
      createNotification({
        text: `Delegation for "${machineIdentityName}" removed`,
        type: "success"
      });
      setIsRemoveOpen(false);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  const UserIcon = MEMBER_KIND[AgentVaultMemberType.User].icon;
  const GroupIcon = MEMBER_KIND[AgentVaultMemberType.Group].icon;

  const renderCoverage = () => {
    if (!delegation) {
      return (
        <p className="text-sm text-muted">
          This machine identity can&apos;t start sessions on behalf of users.
        </p>
      );
    }
    return (
      <DetailGroup>
        <Detail>
          <DetailLabel>Acts On Behalf Of</DetailLabel>
          <DetailValue>
            {delegation.scope === AgentVaultDelegationScope.AllMembers ? (
              "Every Agent Vault member"
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {delegation.groups.map((group) => (
                  <Badge key={group.id} variant="neutral">
                    <GroupIcon />
                    {group.name}
                  </Badge>
                ))}
                {delegation.users.map((user) => (
                  <Badge key={user.id} variant="neutral">
                    <UserIcon />
                    {memberDisplayName({ type: AgentVaultMemberType.User, ...user })}
                  </Badge>
                ))}
              </div>
            )}
          </DetailValue>
        </Detail>
      </DetailGroup>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Delegation
          <DocumentationLinkBadge href={AgentVaultDocsUrls.sessionsOnBehalfOfUsers} />
        </CardTitle>
        <CardDescription>
          Let this machine identity start sessions on behalf of users, with their access bundles and
          personal values.
        </CardDescription>
        {!isPending && (
          <CardAction className="flex gap-2">
            {delegation ? (
              <>
                <Button variant="outline" onClick={() => setIsEditOpen(true)}>
                  <PencilIcon />
                  Edit Delegation
                </Button>
                <Button variant="danger" onClick={() => setIsRemoveOpen(true)}>
                  <Trash2Icon />
                  Remove
                </Button>
              </>
            ) : (
              <Button variant="av" onClick={() => setIsEditOpen(true)}>
                <PlusIcon />
                Set Up Delegation
              </Button>
            )}
          </CardAction>
        )}
      </CardHeader>
      <CardContent>{isPending ? <Skeleton className="h-4 w-1/2" /> : renderCoverage()}</CardContent>

      <DelegationDialog
        isOpen={isEditOpen}
        onOpenChange={setIsEditOpen}
        machineIdentityId={machineIdentityId}
        machineIdentityName={machineIdentityName}
        delegation={delegation}
      />

      <DeleteConfirmDialog
        isOpen={isRemoveOpen}
        onOpenChange={setIsRemoveOpen}
        title={`Remove Delegation for "${machineIdentityName}"`}
        description="It can no longer start sessions on behalf of users, and the sessions it already started on their behalf stop working."
        confirmKey="remove"
        confirmLabel="Remove Delegation"
        isPending={deleteDelegation.isPending}
        onConfirm={handleRemove}
      />
    </Card>
  );
};
