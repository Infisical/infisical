import { createNotification } from "@app/components/notifications";
import { Button } from "@app/components/v2";
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
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex w-full items-center justify-between">
        <p className="text-xl font-medium">Index Secret References</p>
      </div>
      <p className="mt-2 mb-4 max-w-2xl text-sm text-gray-400">
        This will index all secret references, enabling integrations to be triggered when their
        values change going forward. This happens automatically when secrets are created or updated.
      </p>
      <Button
        variant="outline_bg"
        isLoading={backfillSecretReferences.isPending}
        onClick={handleBackfill}
        isDisabled={!isAdmin}
      >
        Index Secret References
      </Button>
    </div>
  );
};
