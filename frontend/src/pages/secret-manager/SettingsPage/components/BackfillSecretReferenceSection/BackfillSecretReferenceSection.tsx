import { createNotification } from "@app/components/notifications";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@app/components/v3";
import { useProject, useProjectPermission } from "@app/context";
import { useBackfillSecretReference } from "@app/hooks/api";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

export const BackfillSecretReferenceSecretion = () => {
  const { currentProject } = useProject();
  const { hasProjectRole } = useProjectPermission();
  const backfillSecretReferences = useBackfillSecretReference();

  if (!currentProject) return null;

  const handleBackfill = async () => {
    if (backfillSecretReferences.isPending) return;
    await backfillSecretReferences.mutateAsync({ projectId: currentProject.id || "" });
    createNotification({ text: "Successfully re-indexed secret references", type: "success" });
  };

  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Index Secret References</CardTitle>
        <CardDescription>
          This will index all secret references, enabling integrations to be triggered when their
          values change going forward. This happens automatically when secrets are created or
          updated.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="outline"
          isPending={backfillSecretReferences.isPending}
          onClick={handleBackfill}
          isDisabled={!isAdmin}
        >
          Index Secret References
        </Button>
      </CardContent>
    </Card>
  );
};
