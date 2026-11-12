import { useId, useMemo, useState } from "react";
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
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@infisical/cipher/ui/data-table";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Meta } from "@infisical/cipher/ui/text";
import slugify from "@sindresorhus/slugify";
import { PencilIcon } from "lucide-react";
import { z } from "zod";

import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import type { WsTag } from "@app/hooks/api/tags/types";

import { useProjectPermission } from "../../access/permissions";
import { useProjectScope } from "../../access/project/scope";
import { saved } from "../../access/toast";
import { AccessRestricted, ListToolbar, Muted, RESTRICTED, usePagedList } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";

import styles from "./tags.module.css";

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

const slugField = z
  .string()
  .trim()
  .min(1, "Enter a slug")
  .max(64, "Use 64 characters or fewer")
  .refine((value) => slugify(value, { lowercase: true }) === value, {
    message: "Use lowercase letters, numbers, and hyphens"
  });

const tagSchema = z.object({
  slug: slugField,
  color: z
    .string()
    .trim()
    .refine((value) => value === "" || HEX_COLOR.test(value), {
      message: "Use a six-digit hex color, or leave it empty"
    })
});

type TagDraft = z.infer<typeof tagSchema>;

const Swatch = ({ color }: { color: string }) => (
  <span
    className={styles.swatch}
    style={HEX_COLOR.test(color) ? { background: color } : undefined}
    aria-hidden
  />
);

const TagDialog = ({
  projectId,
  tag,
  open,
  onOpenChange
}: {
  projectId: string;
  tag?: WsTag;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const adapter = useV4Adapter("projectTags");
  const create = adapter.useCreateTag();
  const update = adapter.useUpdateTag();
  const formId = useId();
  const [draft, setDraft] = useState<TagDraft>({ slug: tag?.slug ?? "", color: tag?.color ?? "" });
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const issues = submitted ? tagSchema.safeParse(draft).error?.flatten().fieldErrors : undefined;
  const color = draft.color.trim();

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>{tag ? "Edit tag" : "Create tag"}</DialogTitle>
        </DialogHeader>
        <form
          id={formId}
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            setSubmitted(true);
            const parsed = tagSchema.safeParse(draft);
            if (!parsed.success) return;
            setPending(true);
            try {
              if (tag) {
                await update.mutateAsync({
                  projectId,
                  tagID: tag.id,
                  tagSlug: parsed.data.slug,
                  tagColor: parsed.data.color
                });
                saved("Tag updated");
              } else {
                await create.mutateAsync({ projectId, tagSlug: parsed.data.slug, tagColor: "" });
                saved("Tag created");
              }
              onOpenChange(false);
            } finally {
              setPending(false);
            }
          }}
        >
          <Stack gap={16}>
            <Field
              label="Slug"
              description={tag ? undefined : "Lowercase letters, numbers, and hyphens."}
              error={issues?.slug?.[0]}
            >
              <Input
                mono
                autoComplete="off"
                placeholder="pci"
                value={draft.slug}
                invalid={Boolean(issues?.slug)}
                onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
              />
            </Field>
            {tag && (
              <Field label="Color" optional error={issues?.color?.[0]}>
                <Input
                  mono
                  autoComplete="off"
                  // v4-check-ignore raw-color -- shows the hex format the API stores
                  placeholder="#000000"
                  value={draft.color}
                  invalid={Boolean(issues?.color)}
                  onChange={(event) => setDraft({ ...draft, color: event.target.value })}
                  trailing={<Swatch color={color} />}
                />
              </Field>
            )}
          </Stack>
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button type="submit" form={formId} loading={pending}>
            {tag ? "Save" : "Create tag"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const TagsSettings = () => {
  const { projectId } = useProjectScope();
  const adapter = useV4Adapter("projectTags");
  const { permission, isPending: permissionPending } = useProjectPermission(projectId);
  const can = (action: ProjectPermissionActions) =>
    permission.can(action, ProjectPermissionSub.Tags);
  const canRead = can(ProjectPermissionActions.Read);
  const canEdit = can(ProjectPermissionActions.Edit);
  const canDelete = can(ProjectPermissionActions.Delete);
  const tags = adapter.useTags(canRead ? projectId : "");
  const deleteTag = adapter.useDeleteTag();
  const [dialog, setDialog] = useState<{ open: boolean; key: number; tag?: WsTag }>({
    open: false,
    key: 0
  });
  const [deleting, setDeleting] = useState<WsTag>();
  const [deletePending, setDeletePending] = useState(false);

  const rows = useMemo(() => tags.data ?? [], [tags.data]);
  const list = usePagedList({
    rows,
    initialSort: { columnId: "slug", direction: "asc" },
    matches: (tag, needle) => tag.slug.toLowerCase().includes(needle),
    compare: (a, b) => a.slug.toLowerCase().localeCompare(b.slug.toLowerCase())
  });

  const openEdit = (tag: WsTag) => {
    if (canEdit) setDialog({ open: true, key: Date.now(), tag });
  };

  const columns: DataTableColumn<WsTag>[] = [
    {
      id: "slug",
      header: "Tag",
      primary: true,
      grow: true,
      sortable: true,
      render: (tag) => (
        <Button
          variant="link"
          underline="hover"
          disabledReason={canEdit ? undefined : RESTRICTED}
          onClick={() => openEdit(tag)}
        >
          {tag.slug}
        </Button>
      )
    },
    {
      id: "color",
      header: "Color",
      width: 160,
      render: (tag) =>
        tag.color && HEX_COLOR.test(tag.color) ? (
          <Inline gap={8} wrap={false}>
            <Swatch color={tag.color} />
            <Meta>{tag.color.toLowerCase()}</Meta>
          </Inline>
        ) : (
          <Muted>None</Muted>
        )
    }
  ];

  const rowActions: DataTableRowActions<WsTag> = {
    renderMenu: (tag) => (
      <>
        <DropdownMenuItem
          disabled={!canEdit}
          description={canEdit ? undefined : RESTRICTED}
          onSelect={() => openEdit(tag)}
        >
          <Icon icon={PencilIcon} />
          Edit tag
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={!canDelete}
          description={canDelete ? undefined : RESTRICTED}
          onSelect={() => setDeleting(tag)}
        >
          <Icon name="trash" />
          Delete tag
        </DropdownMenuItem>
      </>
    )
  };

  const loading = permissionPending || (canRead && tags.isPending);
  const searching = Boolean(list.search.trim());
  const hasRows = loading || list.filtered.length > 0;
  const canCreate = can(ProjectPermissionActions.Create);

  return (
    <>
      <Card
        variant="framed"
        title="Tags"
        flush={canRead && hasRows}
        action={
          <Inline gap={8} wrap={false}>
            {canRead && rows.length > 0 && (
              <ListToolbar
                band
                search={list.search}
                onSearch={list.setSearch}
                placeholder="Search tags"
              />
            )}
            <Button
              variant="accent"
              size="xs"
              icon="plus"
              disabledReason={canCreate ? undefined : RESTRICTED}
              onClick={() => setDialog({ open: true, key: Date.now() })}
            >
              Create tag
            </Button>
          </Inline>
        }
      >
        {!loading && !canRead && <AccessRestricted />}
        {(loading || canRead) &&
          (hasRows ? (
            <DataTable
              label="Tags"
              rows={list.pageRows}
              columns={columns}
              loading={loading}
              loadingRows={4}
              getRowId={(tag) => tag.id}
              rowLabel={(tag) => tag.slug}
              sort={list.sort}
              onSortChange={list.setSort}
              onRowActivate={canEdit ? openEdit : undefined}
              rowActions={rowActions}
              pagination={loading ? undefined : list.pagination}
            />
          ) : (
            <EmptyState
              size="sm"
              icon={searching ? "search" : "link"}
              title={searching ? "No tags match search" : "No tags"}
              description={searching ? undefined : "Tags group secrets across environments."}
            />
          ))}
      </Card>
      <TagDialog
        key={dialog.key}
        projectId={projectId}
        tag={dialog.tag}
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && !deletePending && setDeleting(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText={deleting?.slug} pending={deletePending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.slug}?</AlertDialogTitle>
            <AlertDialogDescription>
              The tag is removed from every secret that has it. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async (event) => {
                event.preventDefault();
                if (!deleting) return;
                setDeletePending(true);
                const done = await deleteTag.mutateAsync({ projectId, tagID: deleting.id }).then(
                  () => true,
                  () => false
                );
                setDeletePending(false);
                if (!done) return;
                saved("Tag deleted");
                setDeleting(undefined);
              }}
            >
              Delete tag
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
