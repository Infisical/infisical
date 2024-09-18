import { createNotification } from "@app/components/notifications";
import { Button } from "@app/components/v2";
import { useProjectPermission, useWorkspace } from "@app/context";
import { useBackfillSecretReference } from "@app/hooks/api";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

export const BackfillSecretReferenceSecretion = () => {
  const { currentWorkspace } = useWorkspace();
  const { membership } = useProjectPermission();
  const backfillSecretReferences = useBackfillSecretReference();

  if (!currentWorkspace) return null;

  const handleBackfill = async () => {
    if (backfillSecretReferences.isLoading) return;
    try {
      await backfillSecretReferences.mutateAsync({ projectId: currentWorkspace.id || "" });
      createNotification({ text: "Successfully re-indexed secret references", type: "success" });
    } catch {
      createNotification({ text: "Failed to re-index secret references", type: "error" });
    }
  };

  const isAdmin = membership.roles.includes(ProjectMembershipRole.Admin);
  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex w-full items-center justify-between">
        <p className="text-xl font-semibold">Index Secret References</p>
      </div>
      <p className="mb-4 mt-2 max-w-2xl text-sm text-gray-400">
        This will index all secret references, enabling integrations to be triggered when their
        values change going forward. This happens automatically when secrets are created or updated.
      </p>
      <Button
        variant="outline_bg"
        isLoading={backfillSecretReferences.isLoading}
        onClick={handleBackfill}
        isDisabled={!isAdmin}
      >
        Index Secret References
      </Button>
    </div>
  );
};
