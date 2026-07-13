import { useState } from "react";
import {
  ArrowRight,
  Box,
  FolderIcon,
  KeyRound,
  Layers,
  Plus,
  SlashIcon,
  Trash2
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  DocumentationLinkBadge,
  IconButton,
  Input
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  TProjectFolderGrant,
  useDeleteProjectFolderGrant,
  useGetProjectFolderGrantUsage,
  useListProjectFolderGrants
} from "@app/hooks/api/projectFolderGrants";

import { ShareSecretsSheet } from "./ShareSecretsSheet";

type FolderPathProps = { folderName: string };

const FolderPath = ({ folderName }: FolderPathProps) => {
  const isRoot = folderName === "root";
  return (
    <Breadcrumb>
      <BreadcrumbList className="flex-nowrap gap-1 sm:gap-1">
        <BreadcrumbItem>
          <FolderIcon className="size-3.5" />
        </BreadcrumbItem>
        {!isRoot && (
          <>
            <BreadcrumbSeparator>
              <SlashIcon className="size-3 -rotate-12" />
            </BreadcrumbSeparator>
            <BreadcrumbPage className="text-muted">{folderName}</BreadcrumbPage>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
};

type DeleteGrantDialogProps = {
  grant: TProjectFolderGrant | null;
  onOpenChange: (open: boolean) => void;
  sourceProjectId: string;
};

const CONFIRMATION_KEYWORD = "confirm";

const DeleteGrantDialog = ({ grant, onOpenChange, sourceProjectId }: DeleteGrantDialogProps) => {
  const [confirmation, setConfirmation] = useState("");
  const deleteGrant = useDeleteProjectFolderGrant();
  const { data: usage, isLoading: isLoadingUsage } = useGetProjectFolderGrantUsage(
    grant?.id ?? "",
    sourceProjectId,
    Boolean(grant)
  );

  const totalUsage = (usage?.importCount ?? 0) + (usage?.referenceCount ?? 0);
  const isConfirmed = confirmation === CONFIRMATION_KEYWORD;

  const handleConfirmDelete = async () => {
    if (!grant || !isConfirmed) return;
    try {
      await deleteGrant.mutateAsync({ grantId: grant.id, sourceProjectId });
      createNotification({ text: "Grant removed", type: "success" });
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      createNotification({ text: "Failed to remove grant", type: "error" });
    }
  };

  const renderDescription = () => {
    if (isLoadingUsage) {
      return "Checking for active usage...";
    }

    if (totalUsage > 0) {
      const parts: string[] = [];
      if (usage!.importCount > 0) {
        parts.push(
          `${usage!.importCount} secret ${usage!.importCount === 1 ? "import" : "imports"}`
        );
      }
      if (usage!.referenceCount > 0) {
        parts.push(
          `${usage!.referenceCount} secret ${usage!.referenceCount === 1 ? "reference" : "references"}`
        );
      }
      return (
        <>
          This grant is actively used by {parts.join(" and ")} in{" "}
          <strong>{grant?.targetProjectName}</strong>. Removing it will break{" "}
          {totalUsage === 1 ? "that link" : "those links"}.
        </>
      );
    }

    return (
      <>
        This will revoke <strong>{grant?.targetProjectName}</strong>&apos;s access to the shared
        secrets. This action cannot be undone.
      </>
    );
  };

  return (
    <AlertDialog
      open={Boolean(grant)}
      onOpenChange={(open) => {
        if (!open) setConfirmation("");
        onOpenChange(open);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Grant</AlertDialogTitle>
          <AlertDialogDescription>{renderDescription()}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="w-full pb-4">
          <p className="mb-2 text-sm text-muted">
            Type <span className="font-medium text-foreground">{CONFIRMATION_KEYWORD}</span> to
            proceed
          </p>
          <Input
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={CONFIRMATION_KEYWORD}
            autoComplete="off"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            onClick={handleConfirmDelete}
            isPending={deleteGrant.isPending}
            disabled={!isConfirmed || isLoadingUsage}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export const CrossProjectSharingSection = () => {
  const [isShareSheetOpen, setIsShareSheetOpen] = useState(false);
  const [grantToDelete, setGrantToDelete] = useState<TProjectFolderGrant | null>(null);
  const { currentProject } = useProject();

  const { data: grants = [] } = useListProjectFolderGrants(currentProject.id);

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-xl font-medium">Cross-Project Secret Sharing</p>
          <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/secret-reference#cross-project-secret-sharing" />
        </div>
        <Button variant="project" size="sm" onClick={() => setIsShareSheetOpen(true)}>
          <Plus className="size-3.5" />
          Share Secrets
        </Button>
        <ShareSecretsSheet isOpen={isShareSheetOpen} onOpenChange={setIsShareSheetOpen} />
      </div>
      <p className="mt-2 mb-4 max-w-2xl text-sm text-gray-400">
        Grant another project read access to a slice of this project&apos;s secrets. The target
        project can then import them, or reference them inline with{" "}
        <code className="rounded bg-mineshaft-700 px-1 py-0.5 font-mono text-xs text-yellow-200">
          ${"{@project-a.SECRET}"}
        </code>
        .
      </p>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm text-mineshaft-400">Granted Access</span>
        <Badge variant="neutral">{grants.length}</Badge>
      </div>
      {grants.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-md border border-mineshaft-700 py-10 text-center">
          <p className="text-sm font-medium text-mineshaft-300">No projects have access yet</p>
          <p className="mt-1 text-xs text-mineshaft-500">
            Share secrets to grant another project read access.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-mineshaft-700 rounded-md border border-mineshaft-700">
          {grants.map((grant) => (
            <div
              key={grant.id}
              className="grid items-center gap-x-3 px-4 py-3"
              style={{ gridTemplateColumns: "minmax(7rem,max-content) 1fr auto 1.75rem" }}
            >
              {/* env */}
              <Badge variant="neutral" className="gap-1.5">
                <Layers className="size-3" />
                {grant.environmentName}
              </Badge>

              {/* folder path → project name */}
              <div className="flex min-w-0 items-center gap-2">
                <FolderPath folderName={grant.folderName} />
                <ArrowRight className="size-3.5 shrink-0 text-mineshaft-400" />
                <div className="flex min-w-0 items-center gap-1.5">
                  <Box className="size-3.5 shrink-0 text-mineshaft-300" />
                  <span className="truncate text-sm font-medium text-mineshaft-100">
                    {grant.targetProjectName}
                  </span>
                </div>
              </div>

              {/* secret count */}
              <div className="flex items-center justify-end gap-1.5 text-xs whitespace-nowrap text-mineshaft-400">
                <KeyRound className="size-3 shrink-0" />
                <span className="tabular-nums">
                  {grant.secretCount} shared {grant.secretCount === 1 ? "secret" : "secrets"}
                </span>
              </div>

              {/* delete */}
              <IconButton variant="ghost-muted" size="xs" onClick={() => setGrantToDelete(grant)}>
                <Trash2 />
              </IconButton>
            </div>
          ))}
        </div>
      )}
      <DeleteGrantDialog
        grant={grantToDelete}
        onOpenChange={(open) => {
          if (!open) setGrantToDelete(null);
        }}
        sourceProjectId={currentProject.id}
      />
    </div>
  );
};
