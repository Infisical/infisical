import { useState } from "react";
import { subject } from "@casl/ability";
import { InfoIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DocumentationLinkBadge,
  Label,
  SecretPathInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import {
  ProjectPermissionSecretFolderActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission,
  useSubscription
} from "@app/context";
import {
  TFolderAccess,
  useCreateIdentityFolderAccess,
  useCreateUserFolderAccess,
  useUpdateIdentityFolderAccess,
  useUpdateUserFolderAccess
} from "@app/hooks/api/folderAccess";
import { useGetProjectFolders } from "@app/hooks/api/secretFolders/queries";
import { normalizeFolderPath } from "@app/pages/secret-manager/OverviewPage/components/FolderAccessSheet/folder-access.utils";

import { ActorSummary } from "./ActorSummary";
import { FolderGrantFields, useFolderGrantDraft } from "./FolderGrantFields";
import { TFolderAccessSectionActor } from "./types";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  actor: TFolderAccessSectionActor;
  existingAccess: TFolderAccess[];
};

type FormProps = {
  actor: TFolderAccessSectionActor;
  existingAccess: TFolderAccess[];
  onClose: () => void;
};

const GrantFolderAccessForm = ({ actor, existingAccess, onClose }: FormProps) => {
  const { projectId, currentProject } = useProject();
  const { permission } = useProjectPermission();
  const { subscription } = useSubscription();

  const environments = currentProject?.environments ?? [];

  const [environmentSlug, setEnvironmentSlug] = useState(environments[0]?.slug ?? "");
  const [secretPath, setSecretPath] = useState("/");

  const createUserAccess = useCreateUserFolderAccess();
  const createIdentityAccess = useCreateIdentityFolderAccess();
  const updateUserAccess = useUpdateUserFolderAccess();
  const updateIdentityAccess = useUpdateIdentityFolderAccess();

  const normalizedPath = normalizeFolderPath(secretPath);
  const isRoot = normalizedPath === "/";
  const parentPath = isRoot ? "/" : normalizedPath.slice(0, normalizedPath.lastIndexOf("/")) || "/";
  const folderName = isRoot ? "" : (normalizedPath.split("/").filter(Boolean).pop() ?? "");

  const { data: siblingFolders = [], isLoading: isCheckingFolder } = useGetProjectFolders({
    projectId,
    environment: environmentSlug,
    path: parentPath,
    options: { enabled: Boolean(environmentSlug) && !isRoot }
  });

  const actorNoun = actor.type === "user" ? "user" : "machine identity";
  const folderExists = isRoot || siblingFolders.some((folder) => folder.name === folderName);
  // picking a folder this actor already has a grant on edits that grant instead of creating one
  const existingGrant =
    existingAccess.find(
      (row) =>
        row.environment === environmentSlug &&
        normalizeFolderPath(row.secretPath) === normalizedPath
    ) ?? null;
  const grant = useFolderGrantDraft(existingGrant, isRoot);

  const targetError = (() => {
    if (!environmentSlug) return "Select an environment.";
    if (!subscription?.secretsFolderRbac && !isRoot)
      return "Without a license, folder access can only be granted on the root folder /. Upgrade your Infisical plan to grant access on other folders.";
    if (isCheckingFolder) return null;
    if (!folderExists) return `No folder at ${normalizedPath} in this environment.`;
    // the backend authorizes a grant against the target folder's own path, not its parent
    if (
      !permission.can(
        ProjectPermissionSecretFolderActions.ManageAccess,
        subject(ProjectPermissionSub.SecretFolders, {
          environment: environmentSlug,
          secretPath: normalizedPath
        })
      )
    )
      return "You do not have permission to manage access on this folder.";
    return null;
  })();

  const editNote =
    existingGrant && !targetError && !isCheckingFolder
      ? `This ${actorNoun} already has access to ${normalizedPath}. Saving updates that access.`
      : null;

  const isSubmitDisabled =
    isCheckingFolder ||
    Boolean(targetError) ||
    grant.isInvalid ||
    (Boolean(existingGrant) && !grant.hasChanges);

  const handleSubmit = async () => {
    const target = { projectId, environmentSlug, secretPath: normalizedPath };

    if (existingGrant) {
      const payload = { ...target, ...grant.updateFields() };
      if (actor.type === "user") {
        await updateUserAccess.mutateAsync({ ...payload, userId: actor.id });
      } else {
        await updateIdentityAccess.mutateAsync({ ...payload, identityId: actor.id });
      }
      createNotification({ type: "success", text: "Folder access updated" });
      onClose();
      return;
    }

    const payload = { ...target, ...grant.createFields() };
    if (actor.type === "user") {
      await createUserAccess.mutateAsync({ ...payload, userId: actor.id });
    } else {
      await createIdentityAccess.mutateAsync({ ...payload, identityId: actor.id });
    }
    createNotification({ type: "success", text: "Folder access granted" });
    onClose();
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          Grant Folder Access
          <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/access-controls/folder-rbac" />
        </SheetTitle>
        <ActorSummary actor={actor} />
      </SheetHeader>

      <div className="thin-scrollbar flex-1 space-y-5 overflow-y-auto p-4">
        <div className="space-y-2">
          <Label>Folder Path</Label>
          <div className="grid grid-cols-[minmax(8rem,0.8fr)_minmax(0,1.2fr)] gap-2">
            <Select
              value={environmentSlug}
              onValueChange={(value) => {
                setEnvironmentSlug(value);
                // folder suggestions and path existence are per environment, so a path carried
                // across a switch would point at a folder that need not exist in the new one
                setSecretPath("/");
              }}
            >
              <SelectTrigger className="w-full" aria-label="Environment">
                <SelectValue placeholder="Select environment" />
              </SelectTrigger>
              <SelectContent position="popper">
                {environments.map((env) => (
                  <SelectItem key={env.id} value={env.slug}>
                    {env.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <SecretPathInput
              aria-label="Folder path"
              projectId={projectId}
              environment={environmentSlug}
              value={secretPath}
              isError={Boolean(targetError)}
              onChange={setSecretPath}
            />
          </div>
          {targetError && <p className="text-xs text-danger">{targetError}</p>}
          {editNote && (
            <p className="flex items-start gap-1.5 text-xs text-muted">
              <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
              {editNote}
            </p>
          )}
        </div>

        <FolderGrantFields grant={grant} />
      </div>

      <SheetFooter className="border-t">
        <Button
          variant="project"
          isFullWidth
          isDisabled={isSubmitDisabled}
          isPending={
            createUserAccess.isPending ||
            createIdentityAccess.isPending ||
            updateUserAccess.isPending ||
            updateIdentityAccess.isPending
          }
          onClick={() => handleSubmit().catch(() => undefined)}
        >
          {existingGrant ? "Save Changes" : "Grant Access"}
        </Button>
      </SheetFooter>
    </>
  );
};

export const GrantFolderAccessSheet = ({ isOpen, onOpenChange, actor, existingAccess }: Props) => (
  <Sheet open={isOpen} onOpenChange={onOpenChange}>
    <SheetContent className="gap-y-0 sm:max-w-[600px]">
      {isOpen && (
        <GrantFolderAccessForm
          actor={actor}
          existingAccess={existingAccess}
          onClose={() => onOpenChange(false)}
        />
      )}
    </SheetContent>
  </Sheet>
);
