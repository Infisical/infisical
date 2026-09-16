import { useState } from "react";
import { subject } from "@casl/ability";

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
  useProjectPermission
} from "@app/context";
import {
  SecretFolderRole,
  TFolderAccess,
  useCreateIdentityFolderAccess,
  useCreateUserFolderAccess
} from "@app/hooks/api/folderAccess";
import { useGetProjectFolders } from "@app/hooks/api/secretFolders/queries";
import { DEFAULT_TEMPORARY_RANGE } from "@app/pages/secret-manager/OverviewPage/components/FolderAccessSheet/folder-access.const";
import {
  isValidTemporaryRange,
  normalizeFolderPath
} from "@app/pages/secret-manager/OverviewPage/components/FolderAccessSheet/folder-access.utils";
import { FolderTierRadioGroup } from "@app/pages/secret-manager/OverviewPage/components/FolderAccessSheet/FolderTierRadioGroup";
import { TemporaryAccessPopover } from "@app/pages/secret-manager/OverviewPage/components/FolderAccessSheet/TemporaryAccessPopover";

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

const actorNameOf = (actor: TFolderAccessSectionActor) => {
  if (actor.type === "identity") return actor.name;
  const fullName = [actor.firstName, actor.lastName].filter(Boolean).join(" ").trim();
  return fullName || actor.username;
};

const GrantFolderAccessForm = ({ actor, existingAccess, onClose }: FormProps) => {
  const { projectId, currentProject } = useProject();
  const { permission } = useProjectPermission();

  const environments = currentProject?.environments ?? [];

  const [environmentSlug, setEnvironmentSlug] = useState(environments[0]?.slug ?? "");
  const [secretPath, setSecretPath] = useState("/");
  const [tier, setTier] = useState(SecretFolderRole.Read);
  const [isTemporary, setIsTemporary] = useState(false);
  const [range, setRange] = useState(DEFAULT_TEMPORARY_RANGE);

  const createUserAccess = useCreateUserFolderAccess();
  const createIdentityAccess = useCreateIdentityFolderAccess();

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
  const isDuplicate = existingAccess.some(
    (row) =>
      row.environment === environmentSlug && normalizeFolderPath(row.secretPath) === normalizedPath
  );
  const isFullAccessTemporary = tier === SecretFolderRole.FullAccess && isTemporary;
  const isRangeValid = !isTemporary || isValidTemporaryRange(range);

  const targetError = (() => {
    if (!environmentSlug) return "Select an environment.";
    if (isCheckingFolder) return null;
    if (!folderExists) return `No folder at ${normalizedPath} in this environment.`;
    if (isDuplicate)
      return `This ${actorNoun} already has access to ${normalizedPath}. Edit the existing access from the table instead.`;
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

  const isSubmitDisabled =
    isCheckingFolder || Boolean(targetError) || isFullAccessTemporary || !isRangeValid;

  const handleSubmit = async () => {
    const type = isTemporary
      ? ({
          isTemporary: true,
          temporaryMode: "relative",
          temporaryRange: range,
          temporaryAccessStartTime: new Date().toISOString()
        } as const)
      : undefined;

    const payload = {
      projectId,
      environmentSlug,
      secretPath: normalizedPath,
      permission: tier,
      type
    };

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
        <div className="mt-2 flex min-w-0 items-center gap-2 text-xs">
          <span className="truncate text-accent">{actorNameOf(actor)}</span>
        </div>
      </SheetHeader>

      <div className="thin-scrollbar flex-1 space-y-5 overflow-y-auto p-4">
        <div className="space-y-2">
          <Label>Folder</Label>
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
        </div>

        <div className="space-y-2">
          <Label>Permission</Label>
          <FolderTierRadioGroup value={tier} onValueChange={setTier} />
          {isFullAccessTemporary && (
            <p className="text-xs text-danger">
              Full Access cannot be temporary. Remove the expiration or choose a lower tier.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Temporary access</Label>
          <TemporaryAccessPopover
            isTemporary={isTemporary}
            range={range}
            label={isTemporary ? `Expires in ${range}` : "No expiration"}
            description="Access is revoked automatically once the duration elapses."
            onApply={(nextRange) => {
              setRange(nextRange);
              setIsTemporary(true);
            }}
            onRemove={() => setIsTemporary(false)}
          />
        </div>
      </div>

      <SheetFooter className="border-t">
        <Button
          variant="project"
          isFullWidth
          isDisabled={isSubmitDisabled}
          isPending={createUserAccess.isPending || createIdentityAccess.isPending}
          onClick={() => handleSubmit().catch(() => undefined)}
        >
          Grant Access
        </Button>
      </SheetFooter>
    </>
  );
};

export const GrantFolderAccessSheet = ({
  isOpen,
  onOpenChange,
  actor,
  existingAccess
}: Props) => (
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
