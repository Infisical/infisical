import {
  FolderAccessControlsUpgradeIntent,
  useUpgradeGate
} from "@app/components/license/UpgradeGate";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  DocumentationLinkBadge,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { useSubscription } from "@app/context";
import {
  TFolderAccess,
  useUpdateIdentityFolderAccess,
  useUpdateUserFolderAccess
} from "@app/hooks/api/folderAccess";
import {
  canGrantFolderAccess,
  isRootFolderPath
} from "@app/pages/secret-manager/OverviewPage/components/FolderAccessSheet/folder-access.utils";
import { FolderPathBreadcrumb } from "@app/pages/secret-manager/OverviewPage/components/FolderAccessSheet/FolderPathBreadcrumb";

import { ActorSummary } from "./ActorSummary";
import { FolderGrantFields, useFolderGrantDraft } from "./FolderGrantFields";
import { TFolderAccessSectionActor } from "./types";

type Props = {
  access: TFolderAccess | null;
  actor: TFolderAccessSectionActor;
  environmentName: string;
  onOpenChange: (isOpen: boolean) => void;
};

type FormProps = {
  access: TFolderAccess;
  actor: TFolderAccessSectionActor;
  environmentName: string;
  onClose: () => void;
};

const EditFolderAccessForm = ({ access, actor, environmentName, onClose }: FormProps) => {
  const grant = useFolderGrantDraft(access, isRootFolderPath(access.secretPath));

  const updateUserAccess = useUpdateUserFolderAccess();
  const updateIdentityAccess = useUpdateIdentityFolderAccess();
  const { subscription } = useSubscription();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();

  const handleSave = async () => {
    if (!canGrantFolderAccess(Boolean(subscription?.secretsFolderRbac), access.secretPath)) {
      openUpgradeGate({
        intent: FolderAccessControlsUpgradeIntent,
        paywallKey: "project.folder-access-section"
      });
      return;
    }
    const payload = {
      projectId: access.projectId,
      environmentSlug: access.environment,
      secretPath: access.secretPath,
      ...grant.updateFields()
    };

    if (actor.type === "user") {
      await updateUserAccess.mutateAsync({ ...payload, userId: actor.id });
    } else {
      await updateIdentityAccess.mutateAsync({ ...payload, identityId: actor.id });
    }
    createNotification({ type: "success", text: "Folder access updated" });
    onClose();
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          Edit Folder Access
          <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/access-controls/folder-rbac" />
        </SheetTitle>
        <ActorSummary actor={actor} />
        <FolderPathBreadcrumb environmentName={environmentName} folderPath={access.secretPath} />
      </SheetHeader>

      <div className="thin-scrollbar flex-1 space-y-5 overflow-y-auto p-4">
        <FolderGrantFields grant={grant} />
      </div>

      <SheetFooter className="justify-end border-t">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="project"
          isDisabled={!grant.hasChanges || grant.isInvalid}
          isPending={updateUserAccess.isPending || updateIdentityAccess.isPending}
          onClick={handleSave}
        >
          Save Changes
        </Button>
      </SheetFooter>
      {upgradeGate}
    </>
  );
};

export const EditFolderAccessSheet = ({ access, actor, environmentName, onOpenChange }: Props) => (
  <Sheet open={Boolean(access)} onOpenChange={onOpenChange}>
    <SheetContent className="gap-y-0 sm:max-w-[600px]">
      {access && (
        <EditFolderAccessForm
          key={access.id}
          access={access}
          actor={actor}
          environmentName={environmentName}
          onClose={() => onOpenChange(false)}
        />
      )}
    </SheetContent>
  </Sheet>
);
