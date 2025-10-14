import { useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { Button, DeleteActionModal } from "@app/components/v2";
import {
  NamespacePermissionNamespaceActions,
  NamespacePermissionSubjects,
  useNamespace,
  useNamespacePermission
} from "@app/context";
import { useDeleteNamespace } from "@app/hooks/api/namespaces";
import { clearSession } from "@app/hooks/api/users/queries";
import { usePopUp } from "@app/hooks/usePopUp";

// TODO(namespace): add leave namespace
export const DeleteNamespaceSection = () => {
  const navigate = useNavigate();
  const { namespace, namespaceId } = useNamespace();

  const { permission } = useNamespacePermission();

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["deleteNamespace"] as const);

  const { mutateAsync, isPending } = useDeleteNamespace();

  const handleDeleteNamespaceSubmit = async () => {
    try {
      await mutateAsync({
        namespaceId
      });

      createNotification({
        text: "Successfully deleted namespace",
        type: "success"
      });

      clearSession();
      navigate({ to: "/organization/projects" });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to delete organization",
        type: "error"
      });
    }
  };

  return (
    <>
      <hr className="my-4 border-mineshaft-600" />
      <div className="rounded-lg border-mineshaft-600 bg-mineshaft-900 p-4">
        <p className="text-md mb-4 text-mineshaft-100">Danger Zone</p>
        <Button
          isLoading={isPending}
          colorSchema="danger"
          variant="outline_bg"
          type="submit"
          onClick={() => handlePopUpOpen("deleteNamespace")}
          isDisabled={permission.cannot(
            NamespacePermissionNamespaceActions.Delete,
            NamespacePermissionSubjects.Namespace
          )}
        >
          {`Delete namespace ${namespace.name}`}
        </Button>
        <DeleteActionModal
          isOpen={popUp.deleteNamespace.isOpen}
          title="Are you sure you want to delete this organization?"
          subTitle={`Permanently remove ${namespace.name} and all of its data. This action is not reversible, so please be careful.`}
          onChange={(isOpen) => handlePopUpToggle("deleteNamespace", isOpen)}
          deleteKey="confirm"
          onDeleteApproved={handleDeleteNamespaceSubmit}
        />
      </div>
    </>
  );
};
