import { useMemo, useState } from "react";
import { type MongoAbility, subject } from "@casl/ability";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { DropdownMenuItem } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline } from "@infisical/cipher/ui/layout";
import { RowActions } from "@infisical/cipher/ui/table";
import { format } from "date-fns";
import { PencilIcon } from "lucide-react";

import {
  ProjectPermissionProjectFolderGrantActions,
  type ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import type { TProjectFolderGrant } from "@app/hooks/api/projectFolderGrants/types";
import type { Project } from "@app/hooks/api/projects/types";

import { saved } from "../../../access/toast";
import { AccessRestricted } from "../../../access/ui";
import { useV4Adapter } from "../../../data/adapters";
import { GrantRevocationImpact } from "./grant-revocation-impact";
import { type ShareSecretsEditData, ShareSecretsSheet } from "./share-secrets-sheet";

const RESTRICTED = "Your role doesn't allow this";
const NOT_IN_PLAN = "Your plan doesn't include cross-project secret sharing";
const CONFIRM_KEYWORD = "confirm";
const DOCS_URL =
  "https://infisical.com/docs/documentation/platform/secret-reference#cross-project-secret-sharing";

type ProjectGroup = {
  targetProjectId: string;
  targetProjectName: string;
  totalSecrets: number;
  grants: TProjectFolderGrant[];
};

const groupGrantsByProject = (grants: TProjectFolderGrant[]): ProjectGroup[] => {
  const byProject = new Map<string, TProjectFolderGrant[]>();
  grants.forEach((grant) => {
    byProject.set(grant.targetProjectId, [...(byProject.get(grant.targetProjectId) ?? []), grant]);
  });
  return Array.from(byProject.entries()).map(([targetProjectId, projectGrants]) => ({
    targetProjectId,
    targetProjectName: projectGrants[0].targetProjectName,
    totalSecrets: projectGrants.reduce((sum, grant) => sum + grant.secretCount, 0),
    grants: [...projectGrants].sort(
      (a, b) =>
        a.environmentName.localeCompare(b.environmentName) ||
        a.secretPath.localeCompare(b.secretPath)
    )
  }));
};

const RevokeProjectDialog = ({
  group,
  sourceProjectId,
  onClose
}: {
  group: ProjectGroup | null;
  sourceProjectId: string;
  onClose: () => void;
}) => {
  const policies = useV4Adapter("secretPolicies");
  const revokeGrants = policies.useRevokeFolderGrants();
  const grants = group?.grants ?? [];
  const usage = policies.useFolderGrantsUsage(
    grants.map((grant) => grant.id),
    sourceProjectId,
    { enabled: Boolean(group) }
  );
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog open={Boolean(group)} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent tone="danger" confirmText={CONFIRM_KEYWORD} pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {group?.targetProjectName}&apos;s access?</AlertDialogTitle>
          <AlertDialogDescription>
            It loses access to all {grants.length} shared{" "}
            {grants.length === 1 ? "folder" : "folders"}. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <GrantRevocationImpact
          usage={usage}
          targetProjectName={group?.targetProjectName}
          folderCount={grants.length}
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={usage.isChecking}
            onClick={async (event) => {
              event.preventDefault();
              if (!grants.length) return;
              setPending(true);
              try {
                await revokeGrants.mutateAsync({ grants, sourceProjectId });
                saved("All grants removed");
                onClose();
              } finally {
                setPending(false);
              }
            }}
          >
            Remove access
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const columns: DataTableColumn<TProjectFolderGrant>[] = [
  {
    id: "environment",
    header: "Environment",
    width: 180,
    primary: true,
    text: (grant) => grant.environmentName,
    render: (grant) => grant.environmentName
  },
  {
    id: "path",
    header: "Folder path",
    grow: true,
    mono: true,
    text: (grant) => grant.secretPath,
    render: (grant) => grant.secretPath
  },
  {
    id: "shared",
    header: "Shared",
    width: 140,
    text: (grant) => format(new Date(grant.createdAt), "MMM d, yyyy 'at' h:mm a"),
    render: (grant) => format(new Date(grant.createdAt), "MMM d, yyyy")
  },
  {
    id: "secrets",
    header: "Secrets shared",
    width: 130,
    align: "end",
    render: (grant) => grant.secretCount
  }
];

export const CrossProjectSharingSection = ({
  project,
  permission,
  inPlan
}: {
  project: Project;
  permission: MongoAbility<ProjectPermissionSet>;
  inPlan: boolean;
}) => {
  const policies = useV4Adapter("secretPolicies");
  const can = (action: ProjectPermissionProjectFolderGrantActions) =>
    permission.can(action, ProjectPermissionSub.ProjectFolderGrant);
  const canFor =
    (action: ProjectPermissionProjectFolderGrantActions) =>
    (environment: string, secretPath: string) =>
      permission.can(
        action,
        subject(ProjectPermissionSub.ProjectFolderGrant, { environment, secretPath })
      );
  const canCreateGrant = canFor(ProjectPermissionProjectFolderGrantActions.CreateGrant);
  const canRevokeGrant = canFor(ProjectPermissionProjectFolderGrantActions.RevokeGrant);
  const canEditGrants =
    can(ProjectPermissionProjectFolderGrantActions.CreateGrant) &&
    can(ProjectPermissionProjectFolderGrantActions.RevokeGrant);
  const canCreateAnyGrant = permission
    .rulesFor(
      ProjectPermissionProjectFolderGrantActions.CreateGrant,
      ProjectPermissionSub.ProjectFolderGrant
    )
    .some((rule) => !rule.inverted);
  const canReadGrants = can(ProjectPermissionProjectFolderGrantActions.ReadGrant);
  const { data: grants, isPending } = policies.useFolderGrants(project.id, {
    enabled: canReadGrants
  });
  const projectGroups = useMemo(() => groupGrantsByProject(grants ?? []), [grants]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editData, setEditData] = useState<ShareSecretsEditData | null>(null);
  const [revoking, setRevoking] = useState<ProjectGroup | null>(null);

  let shareBlocked: string | undefined;
  if (!canCreateAnyGrant) shareBlocked = RESTRICTED;
  else if (!inPlan) shareBlocked = NOT_IN_PLAN;

  const editBlocked = (group: ProjectGroup) => {
    if (!inPlan) return NOT_IN_PLAN;
    if (
      canEditGrants ||
      group.grants.some((grant) => canRevokeGrant(grant.environmentSlug, grant.secretPath))
    )
      return undefined;
    return RESTRICTED;
  };
  const revokeBlocked = (group: ProjectGroup) =>
    group.grants.every((grant) => canRevokeGrant(grant.environmentSlug, grant.secretPath))
      ? undefined
      : RESTRICTED;

  return (
    <>
      <Card
        variant="framed"
        flush
        title="Cross-project secret sharing"
        hint="Gives other projects read access to folders here, to import or reference inline."
        action={
          <Inline gap={8} wrap={false}>
            <DocumentationLink href={DOCS_URL} subject="cross-project secret sharing" />
            <Button
              variant="accent"
              size="xs"
              icon="plus"
              disabledReason={shareBlocked}
              onClick={() => {
                setEditData(null);
                setSheetOpen(true);
              }}
            >
              Share secrets
            </Button>
          </Inline>
        }
      >
        {canReadGrants ? (
          <DataTable
            label="Projects with access"
            groups={projectGroups.map((group) => {
              const edit = editBlocked(group);
              const revoke = revokeBlocked(group);
              return {
                id: group.targetProjectId,
                label: group.targetProjectName,
                meta: `${group.totalSecrets} ${group.totalSecrets === 1 ? "secret" : "secrets"} shared`,
                rows: group.grants,
                actions: (
                  <RowActions
                    label={group.targetProjectName}
                    menu={
                      <>
                        <DropdownMenuItem
                          disabled={Boolean(edit)}
                          description={edit}
                          onSelect={() => {
                            setEditData({
                              targetProjectId: group.targetProjectId,
                              targetProjectName: group.targetProjectName,
                              grants: group.grants
                            });
                            setSheetOpen(true);
                          }}
                        >
                          <Icon icon={PencilIcon} />
                          Edit shared folders
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={Boolean(revoke)}
                          description={revoke}
                          onSelect={() => setRevoking(group)}
                        >
                          <Icon name="trash" />
                          Remove access
                        </DropdownMenuItem>
                      </>
                    }
                  />
                )
              };
            })}
            columns={columns}
            loading={isPending}
            getRowId={(grant) => grant.id}
            rowLabel={(grant) => `${grant.environmentName} ${grant.secretPath}`}
            rowActions={{}}
            rowContextMenu={false}
            empty={
              <EmptyState
                size="sm"
                title="No projects have access yet"
                description="Share secrets to give another project read access."
              />
            }
          />
        ) : (
          <AccessRestricted />
        )}
      </Card>
      <ShareSecretsSheet
        project={project}
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setEditData(null);
        }}
        editData={editData}
        existingGrants={grants ?? []}
        canCreateGrant={canCreateGrant}
        canRevokeGrant={canRevokeGrant}
      />
      <RevokeProjectDialog
        group={revoking}
        sourceProjectId={project.id}
        onClose={() => setRevoking(null)}
      />
    </>
  );
};
