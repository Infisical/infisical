import { RolesThatCanUseTable } from "@app/components/agent-vault/RolesThatCanUseTable";
import { Button, Card, CardDescription, CardHeader, CardTitle } from "@app/components/v3";
import { useProject } from "@app/context";
import { useListAgentVaultAccessBundleRoles } from "@app/hooks/api/agentVault";

export const BundleRolesCard = ({ accessBundleId }: { accessBundleId: string }) => {
  const { projectId } = useProject();
  const {
    data: roles,
    isPending,
    isError,
    refetch
  } = useListAgentVaultAccessBundleRoles(projectId, accessBundleId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Who Can Use This Bundle</CardTitle>
        <CardDescription>
          Holders of these roles can start sessions from this bundle, with every service and skill
          in it. Open a role to change what it allows or who holds it.
        </CardDescription>
      </CardHeader>
      {isError ? (
        <div className="flex flex-col items-start gap-2 px-6 pb-6 text-sm text-muted">
          Couldn&apos;t load the roles that can use this bundle.
          <Button variant="outline" size="xs" onClick={() => refetch()}>
            Try Again
          </Button>
        </div>
      ) : (
        <RolesThatCanUseTable roles={roles} isPending={isPending} />
      )}
    </Card>
  );
};
