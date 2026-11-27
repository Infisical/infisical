import { useMemo, useState } from "react";
import type { MongoAbility, MongoQuery, RawRuleOf } from "@casl/ability";
import { Badge } from "@infisical/cipher/ui/badge";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { FileTree, type FileTreeNode } from "@infisical/cipher/ui/file-tree";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import { Select } from "@infisical/cipher/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetSubheader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";

import { PermissionAccess } from "@app/components/permissions/AccessTree/types";
import { createFolderNode } from "@app/components/permissions/AccessTree/utils/createFolderNode";
import { getSubjectActionRuleMap } from "@app/components/permissions/AccessTree/utils/getActionRuleMap";
import type {
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { evaluatePermissionsAbility } from "@app/helpers/permissions";
import type { TProjectPermission } from "@app/hooks/api/roles/types";
import type { TSecretFolderWithPath } from "@app/hooks/api/secretFolders/types";

import { useV4Adapter } from "../../data/adapters";
import { actionLabel } from "./permissions-model";

const ACCESS_BADGE: Record<PermissionAccess, { tone: "ok" | "warn" | "outline"; label: string }> = {
  [PermissionAccess.Full]: { tone: "ok", label: "Allowed" },
  [PermissionAccess.Partial]: { tone: "warn", label: "Conditional" },
  [PermissionAccess.None]: { tone: "outline", label: "No access" }
};

const summary = (actions: Record<string, PermissionAccess>) => {
  const values = Object.values(actions);
  if (values.some((value) => value === PermissionAccess.Full))
    return values.every((value) => value === PermissionAccess.Full)
      ? PermissionAccess.Full
      : PermissionAccess.Partial;
  if (values.some((value) => value === PermissionAccess.Partial)) return PermissionAccess.Partial;
  return PermissionAccess.None;
};

export const AccessTreeSheet = ({
  projectId,
  subject,
  title,
  permissions,
  onOpenChange
}: {
  projectId: string;
  subject: string;
  title: string;
  permissions: TProjectPermission[];
  onOpenChange: (open: boolean) => void;
}) => {
  const access = useV4Adapter("access");
  const environments = access.useProject(projectId).data?.environments ?? [];
  const { data: tree, isPending } = access.useProjectEnvironmentFolders(projectId, {});
  const [environment, setEnvironment] = useState<string>();
  const [secretName, setSecretName] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const env = environment ?? environments[0]?.slug ?? "";
  const ability = useMemo(
    () =>
      evaluatePermissionsAbility(
        [...permissions].sort(
          (a, b) => Number(Boolean(a.inverted)) - Number(Boolean(b.inverted))
        ) as RawRuleOf<MongoAbility<ProjectPermissionSet, MongoQuery>>[]
      ),
    [permissions]
  );

  const evaluated = useMemo(() => {
    const folders: TSecretFolderWithPath[] = tree?.[env]?.folders ?? [];
    const sub = subject as ProjectPermissionSub;
    const actionRuleMap = getSubjectActionRuleMap(sub, ability);
    return folders.map((folder) => ({
      folder,
      actions: createFolderNode({
        folder,
        permissions: ability,
        environment: env,
        subject: sub,
        secretName,
        actionRuleMap,
        metadata: []
      }).data.actions as Record<string, PermissionAccess>
    }));
  }, [tree, env, subject, ability, secretName]);

  const items = useMemo(() => {
    const children = new Map<string, typeof evaluated>();
    evaluated.forEach((entry) => {
      const parent = entry.folder.parentId ?? "";
      children.set(parent, [...(children.get(parent) ?? []), entry]);
    });
    const build = (parent: string): FileTreeNode[] =>
      (children.get(parent) ?? [])
        .sort((a, b) => a.folder.name.localeCompare(b.folder.name))
        .map(({ folder, actions }) => {
          const badge = ACCESS_BADGE[summary(actions)];
          return {
            id: folder.id,
            name: folder.path === "/" ? "/" : folder.name,
            label: folder.path,
            type: "folder" as const,
            meta: <Badge tone={badge.tone}>{badge.label}</Badge>,
            children: build(folder.id)
          };
        });
    return build("");
  }, [evaluated]);

  const active =
    evaluated.find((entry) => entry.folder.id === selected) ??
    evaluated.find((entry) => entry.folder.path === "/");

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>{`Access to ${title}`}</SheetTitle>
        </SheetHeader>
        <SheetSubheader>
          <Inline gap={8}>
            <Select
              label="Environment"
              size="sm"
              width="md"
              value={env}
              onChange={(value) => {
                setEnvironment(value);
                setSelected(null);
              }}
              options={environments.map((item) => ({ value: item.slug, label: item.name }))}
            />
            {subject === "secrets" && (
              <Input
                aria-label="Secret name"
                placeholder="Secret name"
                size="sm"
                value={secretName}
                onChange={(event) => setSecretName(event.target.value)}
              />
            )}
          </Inline>
        </SheetSubheader>
        <SheetBody>
          <Stack gap={16}>
            <FileTree
              label={`Folders in ${env}`}
              items={items}
              foldersOnly
              selectable="folders"
              selected={active?.folder.id ?? null}
              onSelect={(id) => setSelected(id)}
              defaultExpanded={items.map((item) => item.id)}
              truncate="middle"
              empty={
                <EmptyState
                  size="sm"
                  icon="folder"
                  title={isPending ? "Loading folders" : "No folders in this environment"}
                />
              }
            />
            {active && (
              <Field label={active.folder.path}>
                <DataList
                  variant="props"
                  density="compact"
                  items={Object.entries(active.actions).map(([action, value]) => [
                    actionLabel("project", subject, action),
                    <Badge key={action} tone={ACCESS_BADGE[value].tone}>
                      {ACCESS_BADGE[value].label}
                    </Badge>
                  ])}
                />
              </Field>
            )}
          </Stack>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
};
