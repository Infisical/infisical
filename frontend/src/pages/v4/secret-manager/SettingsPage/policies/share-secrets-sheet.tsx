import { useEffect, useState } from "react";
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
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { MultiSelect } from "@infisical/cipher/ui/multi-select";
import { Select } from "@infisical/cipher/ui/select";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";

import type { TProjectFolderGrant } from "@app/hooks/api/projectFolderGrants/types";
import type { Project } from "@app/hooks/api/projects/types";

import { saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import { GrantRevocationImpact } from "./grant-revocation-impact";

import styles from "./policies.module.css";

const RESTRICTED = "Your role doesn't allow this";

type EnvironmentGroup = { key: number; environment: string; secretPaths: string[] };

export type ShareSecretsEditData = {
  targetProjectId: string;
  targetProjectName: string;
  grants: TProjectFolderGrant[];
};

export type GrantCheck = (environment: string, secretPath: string) => boolean;

const normalizePath = (path: string) => {
  const segments = path.split("/").filter(Boolean);
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
};

const entryKey = (environment: string, secretPath: string) =>
  `${environment}:${normalizePath(secretPath)}`;

let nextKey = 0;
const newGroup = (environment = "", secretPaths: string[] = []): EnvironmentGroup => {
  nextKey += 1;
  return { key: nextKey, environment, secretPaths };
};

const flatten = (groups: EnvironmentGroup[]) =>
  groups.flatMap((group) =>
    group.secretPaths.map((secretPath) => ({ environment: group.environment, secretPath }))
  );

const PathAdder = ({
  projectId,
  environment,
  existingPaths,
  canCreateGrant,
  onAdd
}: {
  projectId: string;
  environment: string;
  existingPaths: string[];
  canCreateGrant: GrantCheck;
  onAdd: (path: string) => void;
}) => {
  const [value, setValue] = useState("/");
  const normalized = normalizePath(value);
  const isRoot = normalized === "/";
  const parentPath = isRoot ? "/" : normalized.substring(0, normalized.lastIndexOf("/")) || "/";
  const folderName = isRoot ? "" : (normalized.split("/").filter(Boolean).pop() ?? "");
  const { data: folders = [], isPending } = useV4Adapter("secretPolicies").useFolders({
    projectId,
    environment,
    path: parentPath,
    enabled: Boolean(environment) && !isRoot
  });
  const pathExists = isRoot || folders.some((folder) => folder.name === folderName);
  let blocked: string | undefined;
  if (!value.trim()) blocked = "Enter a folder path";
  else if (existingPaths.includes(normalized)) blocked = "This folder is already added";
  else if (!pathExists)
    blocked = isPending && !isRoot ? "Checking folder" : "No folder at this path";
  else if (!canCreateGrant(environment, normalized)) blocked = RESTRICTED;

  const add = () => {
    if (blocked) return;
    onAdd(normalized);
    setValue("/");
  };

  return (
    <div className={styles.pathAdder}>
      <Input
        mono
        aria-label="Folder path to share"
        placeholder="/folder"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            add();
          }
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        icon="plus"
        disabledReason={blocked}
        onClick={add}
      >
        Add
      </Button>
    </div>
  );
};

const EnvironmentGroupCard = ({
  projectId,
  group,
  environments,
  usedEnvironments,
  canCreateGrant,
  canRevokeGrant,
  onChange,
  onRemove
}: {
  projectId: string;
  group: EnvironmentGroup;
  environments: Project["environments"];
  usedEnvironments: Set<string>;
  canCreateGrant: GrantCheck;
  canRevokeGrant: GrantCheck;
  onChange: (group: EnvironmentGroup) => void;
  onRemove: () => void;
}) => {
  const envName = environments.find((env) => env.slug === group.environment)?.name;
  let pathCount = "No folders selected";
  if (group.secretPaths.length)
    pathCount = `${group.secretPaths.length} ${group.secretPaths.length === 1 ? "folder" : "folders"}`;
  const removeBlocked = group.secretPaths.some((path) => !canRevokeGrant(group.environment, path));
  return (
    <Card
      size="sm"
      title={group.environment ? (envName ?? group.environment) : "Environment"}
      description={group.environment ? pathCount : undefined}
      action={
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          icon="trash"
          iconOnly
          disabledReason={removeBlocked ? RESTRICTED : undefined}
          onClick={onRemove}
        >
          Remove environment
        </Button>
      }
    >
      <Stack gap={8}>
        {!group.environment && (
          <Select
            label="Environment"
            placeholder="Select environment"
            options={environments
              .filter((env) => !usedEnvironments.has(env.slug))
              .map((env) => ({ value: env.slug, label: env.name }))}
            onChange={(environment) => onChange({ ...group, environment, secretPaths: [] })}
          />
        )}
        {group.secretPaths.map((path) => (
          <div key={path} className={styles.pathRow}>
            <Icon name="folder" />
            <span className={styles.pathValue}>{path}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              icon="x"
              iconOnly
              disabledReason={canRevokeGrant(group.environment, path) ? undefined : RESTRICTED}
              onClick={() =>
                onChange({
                  ...group,
                  secretPaths: group.secretPaths.filter((entry) => entry !== path)
                })
              }
            >
              {`Remove ${path}`}
            </Button>
          </div>
        ))}
        {group.environment && (
          <PathAdder
            projectId={projectId}
            environment={group.environment}
            existingPaths={group.secretPaths}
            canCreateGrant={canCreateGrant}
            onAdd={(path) => onChange({ ...group, secretPaths: [...group.secretPaths, path] })}
          />
        )}
      </Stack>
    </Card>
  );
};

export const ShareSecretsSheet = ({
  project,
  open,
  onOpenChange,
  editData,
  existingGrants,
  canCreateGrant,
  canRevokeGrant
}: {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editData: ShareSecretsEditData | null;
  existingGrants: TProjectFolderGrant[];
  canCreateGrant: GrantCheck;
  canRevokeGrant: GrantCheck;
}) => {
  const policies = useV4Adapter("secretPolicies");
  const createGrant = policies.useCreateFolderGrant();
  const deleteGrant = policies.useDeleteFolderGrant();
  const { data: projects = [], isPending: projectsPending } = policies.useShareTargetProjects();
  const [groups, setGroups] = useState<EnvironmentGroup[]>([newGroup()]);
  const [targetProjectIds, setTargetProjectIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const isEditMode = Boolean(editData);

  useEffect(() => {
    if (!open) return;
    setTargetProjectIds([]);
    if (!editData) {
      setGroups([newGroup()]);
      return;
    }
    const byEnvironment = new Map<string, string[]>();
    editData.grants.forEach((grant) => {
      byEnvironment.set(grant.environmentSlug, [
        ...(byEnvironment.get(grant.environmentSlug) ?? []),
        grant.secretPath
      ]);
    });
    const initial = Array.from(byEnvironment.entries()).map(([env, paths]) => newGroup(env, paths));
    setGroups(initial.length ? initial : [newGroup()]);
  }, [open, editData]);

  const usedEnvironments = new Set(groups.map((group) => group.environment).filter(Boolean));
  const remainingKeys = new Set(
    flatten(groups).map((entry) => entryKey(entry.environment, entry.secretPath))
  );
  const revokedGrants = (editData?.grants ?? []).filter(
    (grant) =>
      !remainingKeys.has(entryKey(grant.environmentSlug, grant.secretPath)) &&
      canRevokeGrant(grant.environmentSlug, grant.secretPath)
  );
  const revokedUsage = policies.useFolderGrantsUsage(
    revokedGrants.map((grant) => grant.id),
    project.id,
    { enabled: confirming }
  );
  const hasValidEntry =
    groups.length > 0 && groups.every((group) => group.environment && group.secretPaths.length);
  let submitBlocked: string | undefined;
  if (!hasValidEntry) submitBlocked = "Add at least one folder in every environment";
  else if (!isEditMode && !targetProjectIds.length)
    submitBlocked = "Choose a project to share with";

  const submit = async () => {
    const entries = flatten(groups).filter((entry) => entry.environment && entry.secretPath);
    if (!entries.length || (!isEditMode && !targetProjectIds.length)) return;
    const existingKeys = new Set(
      existingGrants.map(
        (grant) => `${grant.targetProjectId}:${grant.environmentSlug}:${grant.secretPath}`
      )
    );
    const operations: Promise<unknown>[] = [];
    if (editData) {
      const currentKeys = new Set(
        entries.map((entry) => entryKey(entry.environment, entry.secretPath))
      );
      const originalKeys = new Set(
        editData.grants.map((grant) => entryKey(grant.environmentSlug, grant.secretPath))
      );
      editData.grants.forEach((grant) => {
        if (
          !currentKeys.has(entryKey(grant.environmentSlug, grant.secretPath)) &&
          canRevokeGrant(grant.environmentSlug, grant.secretPath)
        ) {
          operations.push(
            deleteGrant.mutateAsync({ grantId: grant.id, sourceProjectId: project.id })
          );
        }
      });
      entries.forEach((entry) => {
        if (
          !originalKeys.has(entryKey(entry.environment, entry.secretPath)) &&
          canCreateGrant(entry.environment, entry.secretPath)
        ) {
          operations.push(
            createGrant.mutateAsync({
              sourceProjectId: project.id,
              environment: entry.environment,
              secretPath: entry.secretPath,
              targetProjectId: editData.targetProjectId
            })
          );
        }
      });
    } else {
      entries.forEach((entry) => {
        targetProjectIds.forEach((targetProjectId) => {
          if (
            existingKeys.has(`${targetProjectId}:${entry.environment}:${entry.secretPath}`) ||
            !canCreateGrant(entry.environment, entry.secretPath)
          )
            return;
          operations.push(
            createGrant.mutateAsync({
              sourceProjectId: project.id,
              environment: entry.environment,
              secretPath: entry.secretPath,
              targetProjectId
            })
          );
        });
      });
    }
    setPending(true);
    try {
      await Promise.all(operations);
      saved(isEditMode ? "Shared folders updated" : "Access granted");
      setConfirming(false);
      onOpenChange(false);
    } catch {
      // Each failed request is toasted by the mutation; the sheet stays open to retry.
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="md" pending={pending}>
        <SheetHeader>
          <SheetTitle>
            {editData ? `Edit folders shared with ${editData.targetProjectName}` : "Share secrets"}
          </SheetTitle>
          {!editData && (
            <SheetDescription>
              Choose folders in this project, then the projects that get read access to them.
            </SheetDescription>
          )}
        </SheetHeader>
        <SheetBody>
          <Stack gap={24}>
            <Stack gap={12}>
              <span className={styles.groupLabel}>Environments and folders</span>
              {groups.map((group) => (
                <EnvironmentGroupCard
                  key={group.key}
                  projectId={project.id}
                  group={group}
                  environments={project.environments}
                  usedEnvironments={usedEnvironments}
                  canCreateGrant={canCreateGrant}
                  canRevokeGrant={canRevokeGrant}
                  onChange={(next) =>
                    setGroups((current) =>
                      current.map((entry) => (entry.key === next.key ? next : entry))
                    )
                  }
                  onRemove={() =>
                    setGroups((current) => {
                      const next = current.filter((entry) => entry.key !== group.key);
                      return next.length ? next : [newGroup()];
                    })
                  }
                />
              ))}
              {groups.length < project.environments.length && (
                <div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    icon="plus"
                    onClick={() => setGroups((current) => [...current, newGroup()])}
                  >
                    Add another environment
                  </Button>
                </div>
              )}
            </Stack>
            {editData ? (
              <Field label="Shared with" wide>
                <Input readOnly value={editData.targetProjectName} />
              </Field>
            ) : (
              <Field
                label="Share with"
                description="These projects get read access to the folders above."
                wide
              >
                <MultiSelect
                  label="Share with"
                  placeholder={projectsPending ? "Loading projects" : "Select projects"}
                  disabled={projectsPending}
                  options={projects
                    .filter((entry) => entry.id !== project.id)
                    .map((entry) => ({ value: entry.id, label: entry.name }))}
                  value={targetProjectIds}
                  onChange={setTargetProjectIds}
                />
              </Field>
            )}
          </Stack>
        </SheetBody>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="outline">Cancel</Button>
          </SheetClose>
          <Button
            loading={pending}
            disabledReason={submitBlocked}
            onClick={() => {
              if (revokedGrants.length) {
                setConfirming(true);
                return;
              }
              submit();
            }}
          >
            {isEditMode ? "Save" : "Share"}
          </Button>
        </SheetFooter>
      </SheetContent>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent tone="danger" pending={pending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove access to shared folders?</AlertDialogTitle>
            <AlertDialogDescription>
              {editData?.targetProjectName} loses access to {revokedGrants.length} shared{" "}
              {revokedGrants.length === 1 ? "folder" : "folders"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <GrantRevocationImpact
            usage={revokedUsage}
            targetProjectName={editData?.targetProjectName}
            folderCount={revokedGrants.length}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={revokedUsage.isChecking}
              onClick={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              Remove and save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
};
