import { useRef, useState } from "react";
import { subject } from "@casl/ability";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { Alert } from "@infisical/cipher/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  DiscardChangesAlertDialog
} from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@infisical/cipher/ui/data-table";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { DropdownMenuItem } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { MiddleTruncate } from "@infisical/cipher/ui/middle-truncate";
import { MultiStep } from "@infisical/cipher/ui/multi-step";
import { RadioGroup, RadioGroupItem } from "@infisical/cipher/ui/radio-group";
import { SecretPathInput } from "@infisical/cipher/ui/secret-path-input";
import { Select } from "@infisical/cipher/ui/select";
import { FolderIcon } from "lucide-react";

import { FolderAccessControlsUpgradeIntent } from "@app/components/license/UpgradeGate/upgrade-intents";
import {
  ProjectPermissionSecretFolderActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { SecretFolderRole, type TFolderAccess } from "@app/hooks/api/folderAccess/types";
import {
  formatExpirationTime,
  normalizeFolderPath
} from "@app/pages/secret-manager/OverviewPage/components/FolderAccessSheet/folder-access.utils";

import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { useUpgradeGate } from "../../license";
import { useProjectPermission } from "../permissions";
import { errorMessage, failed, readableFailure, saved } from "../toast";
import { RESTRICTED } from "../ui";
import { DurationBadge, DurationPicker, type GrantDraft, permanent } from "./temporary-access";

const FOLDER_ACCESS_DOCS_URL =
  "https://infisical.com/docs/documentation/platform/access-controls/folder-rbac";
const FULL_ACCESS_TEMPORARY = "Full access cannot be temporary";

const TIERS = [
  { value: SecretFolderRole.List, label: "List", description: "Secret and import names only." },
  {
    value: SecretFolderRole.Read,
    label: "Read",
    description: "Also reads values and generates dynamic credentials."
  },
  {
    value: SecretFolderRole.Edit,
    label: "Edit",
    description: "Also adds, edits and deletes secrets."
  },
  {
    value: SecretFolderRole.Manage,
    label: "Manage",
    description: "Also manages rotations, dynamic secrets and honey tokens."
  },
  {
    value: SecretFolderRole.FullAccess,
    label: "Full access",
    description: "Also deletes the folder and grants access to it."
  }
];

const tierLabel = (tier: SecretFolderRole) =>
  TIERS.find((option) => option.value === tier)?.label ?? tier;

export type FolderAccessActor = { type: "user" | "identity"; id: string; name: string };

const draftOf = (row: TFolderAccess): GrantDraft => {
  if (!row.isTemporary) return permanent(row.permission);
  const remaining = row.temporaryAccessEndTime
    ? formatExpirationTime(row.temporaryAccessEndTime, Date.now())
    : null;
  return {
    role: row.permission,
    isTemporary: true,
    temporaryRange: row.temporaryRange ?? undefined,
    temporaryAccessStartTime: row.temporaryAccessStartTime ?? undefined,
    temporaryAccessEndTime: remaining?.isExpired
      ? new Date(0).toISOString()
      : (row.temporaryAccessEndTime ?? undefined)
  };
};

const grantType = (draft: GrantDraft) =>
  draft.isTemporary && draft.temporaryRange
    ? ({
        isTemporary: true,
        temporaryMode: "relative",
        temporaryRange: draft.temporaryRange,
        temporaryAccessStartTime: draft.temporaryAccessStartTime ?? new Date().toISOString()
      } as const)
    : ({ isTemporary: false } as const);

type FolderAccessChange = { permission?: SecretFolderRole; draft?: GrantDraft };

const useFolderAccessMutations = (actor: FolderAccessActor) => {
  const secrets = useV4Adapter("secrets");
  const createUser = secrets.useCreateUserFolderAccess();
  const updateUser = secrets.useUpdateUserFolderAccess();
  const deleteUser = secrets.useDeleteUserFolderAccess();
  const createIdentity = secrets.useCreateIdentityFolderAccess();
  const updateIdentity = secrets.useUpdateIdentityFolderAccess();
  const deleteIdentity = secrets.useDeleteIdentityFolderAccess();
  const isUser = actor.type === "user";
  type Target = { projectId: string; environmentSlug: string; secretPath: string };
  return {
    create: (target: Target, permission: SecretFolderRole, draft: GrantDraft) =>
      isUser
        ? createUser.mutateAsync({
            ...target,
            userId: actor.id,
            permission,
            type: grantType(draft)
          })
        : createIdentity.mutateAsync({
            ...target,
            identityId: actor.id,
            permission,
            type: grantType(draft)
          }),
    update: (target: Target, { permission, draft }: FolderAccessChange) => {
      const type = draft ? grantType(draft) : undefined;
      return isUser
        ? updateUser.mutateAsync({ ...target, userId: actor.id, permission, type })
        : updateIdentity.mutateAsync({ ...target, identityId: actor.id, permission, type });
    },
    remove: (target: Target) =>
      isUser
        ? deleteUser.mutateAsync({ ...target, userId: actor.id })
        : deleteIdentity.mutateAsync({ ...target, identityId: actor.id })
  };
};

const GrantFolderAccessDialog = ({
  open,
  projectId,
  actor,
  existing,
  onOpenChange
}: {
  open: boolean;
  projectId: string;
  actor: FolderAccessActor;
  existing: readonly TFolderAccess[];
  onOpenChange: (open: boolean) => void;
}) => {
  const access = useV4Adapter("access");
  const { permission } = useProjectPermission(projectId);
  const environments = access.useProject(projectId).data?.environments ?? [];
  const folderTree = access.useProjectEnvironmentFolders(projectId, {}).data;
  const mutations = useFolderAccessMutations(actor);
  const [environment, setEnvironment] = useState(environments[0]?.slug ?? "");
  const [path, setPath] = useState("/");
  const [parent, setParent] = useState("/");
  const [tier, setTier] = useState(SecretFolderRole.Read);
  const [draft, setDraft] = useState<GrantDraft>(() => permanent(SecretFolderRole.Read));
  const completed = useRef(false);
  const guard = useDiscardChangesGuard({
    isDirty:
      Boolean(environment) ||
      path !== "/" ||
      tier !== SecretFolderRole.Read ||
      JSON.stringify(draft) !== JSON.stringify(permanent(SecretFolderRole.Read)),
    onDiscard: () => onOpenChange(false)
  });
  const env = environment || environments[0]?.slug || "";
  const folders = folderTree?.[env]?.folders ?? [];
  const parentOf = (value: string) =>
    value === "/" ? "" : value.slice(0, value.lastIndexOf("/")) || "/";
  const normalized = normalizeFolderPath(path);
  const actorNoun = actor.type === "user" ? "user" : "machine identity";

  const targetError = (() => {
    if (!env) return "Select an environment.";
    if (folderTree && normalized !== "/" && !folders.some((folder) => folder.path === normalized))
      return `No folder at ${normalized} in this environment.`;
    if (
      existing.some(
        (row) => row.environment === env && normalizeFolderPath(row.secretPath) === normalized
      )
    )
      return `This ${actorNoun} already has access to ${normalized}.`;
    if (
      !permission.can(
        ProjectPermissionSecretFolderActions.ManageAccess,
        subject(ProjectPermissionSub.SecretFolders, { environment: env, secretPath: normalized })
      )
    )
      return "You do not have permission to manage access on this folder.";
    return undefined;
  })();
  const temporaryError =
    tier === SecretFolderRole.FullAccess && draft.isTemporary ? FULL_ACCESS_TEMPORARY : undefined;

  return (
    <>
      <MultiStep
        variant="dialog"
        open={open}
        onOpenChange={(next) => {
          if (next || completed.current) {
            onOpenChange(next);
            return;
          }
          guard.requestDiscard();
        }}
        title={`Grant folder access to ${actor.name}`}
        completeLabel="Grant access"
        onComplete={async () => {
          await mutations
            .create({ projectId, environmentSlug: env, secretPath: normalized }, tier, draft)
            .catch(readableFailure("Couldn't grant folder access."));
          saved("Folder access granted");
          completed.current = true;
        }}
        steps={[
          {
            title: "Folder access",
            disabledReason: targetError ?? temporaryError,
            content: (
              <Stack gap={16}>
                <Field label="Folder" error={targetError}>
                  <Inline gap={8} wrap={false}>
                    <Select
                      aria-label="Environment"
                      width="sm"
                      value={env}
                      onChange={(value) => {
                        setEnvironment(value);
                        setPath("/");
                      }}
                      options={environments.map((item) => ({ value: item.slug, label: item.name }))}
                    />
                    <SecretPathInput
                      aria-label="Folder path"
                      value={path}
                      invalid={Boolean(targetError)}
                      onChange={setPath}
                      onParentPathChange={setParent}
                      folders={folders
                        .filter((folder) => folder.path !== "/" && parentOf(folder.path) === parent)
                        .map((folder) => folder.name)}
                    />
                  </Inline>
                </Field>
                <Field label="Access">
                  <RadioGroup
                    value={tier}
                    onValueChange={(value) => setTier(value as SecretFolderRole)}
                  >
                    {TIERS.map((option) => (
                      <RadioGroupItem
                        key={option.value}
                        value={option.value}
                        label={option.label}
                        description={option.description}
                      />
                    ))}
                  </RadioGroup>
                </Field>
                <Field label="Duration" error={temporaryError}>
                  <DurationPicker grant={draft} label="Duration" onChange={setDraft} />
                </Field>
              </Stack>
            )
          }
        ]}
      />
      <DiscardChangesAlertDialog
        {...guard.discardDialogProps}
        description="The folder access you started granting will be lost."
      />
    </>
  );
};

const useActorFolderAccess = (projectId: string, actor: FolderAccessActor, enabled: boolean) => {
  const secrets = useV4Adapter("secrets");
  const isUser = actor.type === "user";
  const userAccess = secrets.useUserFolderAccess({
    projectId,
    userId: isUser ? actor.id : "",
    enabled: enabled && isUser
  });
  const identityAccess = secrets.useIdentityFolderAccess({
    projectId,
    identityId: isUser ? "" : actor.id,
    enabled: enabled && !isUser
  });
  return isUser ? userAccess : identityAccess;
};

type Change = (row: TFolderAccess, change: FolderAccessChange) => void;

const TierCell = ({
  row,
  editable,
  onChange
}: {
  row: TFolderAccess;
  editable: boolean;
  onChange: Change;
}) => {
  if (!editable) return tierLabel(row.permission);
  return (
    <Select
      aria-label={`Access to ${row.secretPath}`}
      size="sm"
      value={row.permission}
      onChange={(value) => onChange(row, { permission: value as SecretFolderRole })}
      options={TIERS.map((option) => ({
        value: option.value,
        label: option.label,
        description: option.description,
        disabled: option.value === SecretFolderRole.FullAccess && row.isTemporary
      }))}
    />
  );
};

const DurationCell = ({
  row,
  editable,
  onChange
}: {
  row: TFolderAccess;
  editable: boolean;
  onChange: Change;
}) => {
  if (!editable) return <DurationBadge grant={draftOf(row)} />;
  return (
    <DurationPicker
      grant={draftOf(row)}
      label={`Duration of access to ${row.secretPath}`}
      disabledReason={
        row.permission === SecretFolderRole.FullAccess ? FULL_ACCESS_TEMPORARY : undefined
      }
      onChange={(draft) => onChange(row, { draft })}
    />
  );
};

const RemoveFolderAccessDialog = ({
  actorName,
  row,
  environmentName,
  onOpenChange,
  onConfirm
}: {
  actorName: string;
  row?: TFolderAccess;
  environmentName: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (row: TFolderAccess) => Promise<void>;
}) => {
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog open={Boolean(row)} onOpenChange={onOpenChange}>
      <AlertDialogContent tone="danger" pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Remove access to ${row?.secretPath ?? ""}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {`${actorName} falls back to their project roles in ${environmentName}.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={async (event) => {
              event.preventDefault();
              if (!row) return;
              setPending(true);
              try {
                await onConfirm(row);
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

export const FolderAccessSection = ({
  projectId,
  actor,
  readOnly = false
}: {
  projectId: string;
  actor: FolderAccessActor;
  readOnly?: boolean;
}) => {
  const { organization } = useV4Session();
  const secrets = useV4Adapter("secrets");
  const access = useV4Adapter("access");
  const { permission } = useProjectPermission(projectId);
  const hasPlan = Boolean(secrets.useOverviewPlan(organization.id).data?.secretsFolderRbac);
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const environments = access.useProject(projectId).data?.environments ?? [];
  const query = useActorFolderAccess(projectId, actor, hasPlan);
  const rows: TFolderAccess[] = hasPlan ? (query.data ?? []) : [];
  const mutations = useFolderAccessMutations(actor);
  const [granting, setGranting] = useState<number>();
  const [removing, setRemoving] = useState<TFolderAccess>();
  const environmentName = (slug: string) =>
    environments.find((item) => item.slug === slug)?.name ?? slug;
  const canManage = (row: Pick<TFolderAccess, "environment" | "secretPath">) =>
    permission.can(
      ProjectPermissionSecretFolderActions.ManageAccess,
      subject(ProjectPermissionSub.SecretFolders, {
        environment: row.environment,
        secretPath: row.secretPath
      })
    );
  const targetOf = (row: TFolderAccess) => ({
    projectId,
    environmentSlug: row.environment,
    secretPath: row.secretPath
  });
  const change = async (row: TFolderAccess, next: FolderAccessChange) => {
    try {
      await mutations.update(targetOf(row), next);
      saved("Folder access updated");
    } catch (error) {
      failed("Failed to update folder access", error);
    }
  };
  const openGrant = () => {
    if (!hasPlan) {
      openUpgradeGate({
        intent: FolderAccessControlsUpgradeIntent,
        paywallKey: "project.folder-access-section"
      });
      return;
    }
    setGranting(Date.now());
  };

  const columns: DataTableColumn<TFolderAccess>[] = [
    {
      id: "folder",
      header: "Folder",
      grow: true,
      mono: true,
      primary: true,
      render: (row) => (
        <Inline gap={6} wrap={false} style={{ minWidth: 0 }}>
          <Icon icon={FolderIcon} size={14} />
          <MiddleTruncate mono keepEnd={14}>
            {row.secretPath}
          </MiddleTruncate>
        </Inline>
      ),
      text: (row) => row.secretPath
    },
    {
      id: "environment",
      header: "Environment",
      width: 120,
      render: (row) => environmentName(row.environment)
    },
    {
      id: "access",
      header: "Access",
      width: 148,
      render: (row) => (
        <TierCell row={row} editable={!readOnly && canManage(row)} onChange={change} />
      )
    },
    {
      id: "duration",
      header: "Duration",
      width: 168,
      render: (row) => (
        <DurationCell row={row} editable={!readOnly && canManage(row)} onChange={change} />
      )
    }
  ];
  const rowActions: DataTableRowActions<TFolderAccess> = {
    renderMenu: (row) => (
      <DropdownMenuItem
        variant="destructive"
        disabled={!canManage(row)}
        description={canManage(row) ? undefined : RESTRICTED}
        onSelect={() => setRemoving(row)}
      >
        <Icon name="trash" />
        Remove folder access
      </DropdownMenuItem>
    )
  };

  const emptyTitle = hasPlan
    ? `This ${actor.type === "user" ? "user" : "machine identity"} has no folder access`
    : "Folder access controls aren't on your plan";
  const grantButton = (variant: "outline" | "accent") => (
    <Button variant={variant} icon="plus" onClick={openGrant}>
      Grant access
    </Button>
  );

  return (
    <>
      <Card
        variant="framed"
        title={
          <Inline gap={8}>
            Folder access
            <DocumentationLink href={FOLDER_ACCESS_DOCS_URL} subject="folder access" />
          </Inline>
        }
        action={readOnly ? undefined : grantButton("accent")}
      >
        {hasPlan && query.error ? (
          <Alert tone="bad" title="Could not load folder access">
            {errorMessage(query.error)}
          </Alert>
        ) : (
          <DataTable
            label="Folder access"
            rows={rows}
            columns={columns}
            rowActions={readOnly ? undefined : rowActions}
            getRowId={(row) => row.id}
            rowLabel={(row) => row.secretPath}
            loading={hasPlan && query.isPending}
            loadingRows={3}
            empty={<EmptyState size="sm" icon="folder" title={emptyTitle} />}
          />
        )}
      </Card>
      {granting !== undefined && (
        <GrantFolderAccessDialog
          key={granting}
          open
          projectId={projectId}
          actor={actor}
          existing={rows}
          onOpenChange={(next) => !next && setGranting(undefined)}
        />
      )}
      <RemoveFolderAccessDialog
        actorName={actor.name}
        row={removing}
        environmentName={removing ? environmentName(removing.environment) : ""}
        onOpenChange={(next) => !next && setRemoving(undefined)}
        onConfirm={async (row) => {
          try {
            await mutations.remove(targetOf(row));
            saved("Folder access removed");
            setRemoving(undefined);
          } catch (error) {
            failed("Failed to remove folder access", error);
          }
        }}
      />
      {upgradeGate}
    </>
  );
};

export const PrivilegesMovedNotice = () => (
  <Alert tone="info" title="Additional privileges moved to folder-level access">
    <Inline gap={6}>
      Folder-level grants override roles and keep working when folders are renamed or moved.
      <DocumentationLink href={FOLDER_ACCESS_DOCS_URL} subject="folder access" />
    </Inline>
  </Alert>
);
