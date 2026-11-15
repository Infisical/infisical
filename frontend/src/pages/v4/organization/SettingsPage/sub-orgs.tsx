import { type ComponentProps, useId, useRef, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
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
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { DropdownMenuItem } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { RowLink } from "@infisical/cipher/ui/row-link";
import slugify from "@sindresorhus/slugify";

import {
  OrgPermissionSubjects,
  OrgPermissionSubOrgActions
} from "@app/context/OrgPermissionContext/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { SubOrgOrderBy, type TSubOrganization } from "@app/hooks/api/subOrganizations/types";
import { GenericResourceNameSchema, slugSchema } from "@app/lib/schemas";

import { useDebounced } from "../../access/org/use-debounced";
import { useOrgPermission } from "../../access/permissions";
import { formatDate } from "../../access/roles";
import { failed, saved } from "../../access/toast";
import { Gate, ListToolbar } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { orgHref, useGo } from "../../links";

const PAGE_SIZES = [10, 20, 50, 100];

type Editing = { mode: "create" } | { mode: "edit"; subOrg: TSubOrganization };

const SubOrgDialog = ({ editing, onClose }: { editing?: Editing; onClose: () => void }) => {
  const adapter = useV4Adapter("orgSettings");
  const create = adapter.useCreateSubOrganization();
  const update = adapter.useUpdateSubOrganization();
  const formId = useId();
  const current = editing?.mode === "edit" ? editing.subOrg : undefined;
  const [name, setName] = useState(current?.name ?? "");
  const [slug, setSlug] = useState(current?.slug ?? "");
  const slugTouched = useRef(Boolean(current));
  const [errors, setErrors] = useState<{ name?: string; slug?: string }>({});
  const [pending, setPending] = useState(false);
  const guard = useDiscardChangesGuard({
    isDirty: name !== (current?.name ?? "") || slug !== (current?.slug ?? ""),
    onDiscard: onClose
  });

  const submit = async () => {
    const nameIssue = GenericResourceNameSchema.safeParse(name).error?.issues[0]?.message;
    const slugIssue = slug.trim()
      ? slugSchema().safeParse(slug.trim()).error?.issues[0]?.message
      : undefined;
    if (nameIssue || slugIssue) {
      setErrors({ name: nameIssue, slug: slugIssue });
      return;
    }
    setPending(true);
    try {
      if (current) {
        await update.mutateAsync({
          subOrgId: current.id,
          name: name.trim(),
          slug: slug.trim() || undefined
        });
        saved("Sub-organization updated");
      } else {
        await create.mutateAsync({ name: name.trim(), ...(slug.trim() && { slug: slug.trim() }) });
        saved("Sub-organization created");
      }
      onClose();
    } catch (error) {
      failed(
        current ? "Failed to update sub-organization" : "Failed to create sub-organization",
        error
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && guard.requestDiscard()}>
        <DialogContent pending={pending}>
          <DialogHeader>
            <DialogTitle>
              {current ? "Edit sub-organization" : "Create sub-organization"}
            </DialogTitle>
          </DialogHeader>
          <form
            id={formId}
            noValidate
            autoComplete="off"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Stack gap={16}>
              <Field label="Name" error={errors.name}>
                <Input
                  value={name}
                  placeholder="Acme Corp"
                  invalid={Boolean(errors.name)}
                  onChange={(event) => {
                    setName(event.target.value);
                    if (!slugTouched.current)
                      setSlug(slugify(event.target.value, { lowercase: true }));
                  }}
                />
              </Field>
              <Field
                label="Slug"
                optional
                error={errors.slug}
                description={current ? undefined : "Generated from the name when left empty."}
              >
                <Input
                  mono
                  value={slug}
                  placeholder="acme-corp"
                  invalid={Boolean(errors.slug)}
                  onChange={(event) => {
                    slugTouched.current = true;
                    setSlug(event.target.value);
                  }}
                />
              </Field>
            </Stack>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={guard.requestDiscard}>
              Cancel
            </Button>
            <Button type="submit" form={formId} loading={pending}>
              {current ? "Save" : "Create sub-organization"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DiscardChangesAlertDialog {...guard.discardDialogProps} />
    </>
  );
};

const JoinButton = ({ subOrg }: { subOrg: TSubOrganization }) => {
  const join = useV4Adapter("orgSettings").useJoinSubOrganization();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      loading={pending}
      onClick={async (event) => {
        event.stopPropagation();
        setPending(true);
        try {
          await join.mutateAsync({ subOrgId: subOrg.id });
          saved(`Joined ${subOrg.name}`);
        } catch (error) {
          failed(`Failed to join ${subOrg.name}`, error);
        } finally {
          setPending(false);
        }
      }}
    >
      Join
    </Button>
  );
};

const DeleteSubOrgDialog = ({
  subOrg,
  onClose
}: {
  subOrg?: TSubOrganization;
  onClose: () => void;
}) => {
  const remove = useV4Adapter("orgSettings").useDeleteSubOrganization();
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog open={Boolean(subOrg)} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent tone="danger" confirmText="confirm" pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {subOrg?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the sub-organization and all of its data. This cannot be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={async (event) => {
              event.preventDefault();
              if (!subOrg) return;
              setPending(true);
              try {
                await remove.mutateAsync({ subOrgId: subOrg.id });
                saved("Sub-organization deleted");
                onClose();
              } catch (error) {
                failed("Failed to delete sub-organization", error);
              } finally {
                setPending(false);
              }
            }}
          >
            Delete sub-organization
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const subOrgColumns = ({
  memberIds,
  canJoin,
  linkOf
}: {
  memberIds: Set<string>;
  canJoin: boolean;
  linkOf: (subOrg: TSubOrganization) => ComponentProps<typeof RowLink>["link"];
}): DataTableColumn<TSubOrganization>[] => [
  {
    id: "name",
    header: "Name",
    primary: true,
    sortable: true,
    text: (row) => row.name,
    render: (row) =>
      memberIds.has(row.id) ? (
        <RowLink link={linkOf(row)} title={row.name}>
          {row.name}
        </RowLink>
      ) : (
        row.name
      )
  },
  {
    id: "slug",
    header: "Slug",
    width: 240,
    mono: true,
    text: (row) => row.slug,
    render: (row) => row.slug
  },
  { id: "created", header: "Created", width: 140, render: (row) => formatDate(row.createdAt) },
  {
    id: "status",
    header: "Status",
    width: 120,
    render: (row) => {
      if (memberIds.has(row.id))
        return (
          <Badge tone="info" icon="check">
            Joined
          </Badge>
        );
      return canJoin ? <JoinButton subOrg={row} /> : null;
    }
  }
];

const subOrgActions = ({
  canEdit,
  canDelete,
  onEdit,
  onDelete
}: {
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (subOrg: TSubOrganization) => void;
  onDelete: (subOrg: TSubOrganization) => void;
}) => {
  if (!canEdit && !canDelete) return undefined;
  return {
    renderMenu: (row: TSubOrganization) => (
      <>
        {canEdit && (
          <DropdownMenuItem onSelect={() => onEdit(row)}>
            <Icon name="pencil" />
            Edit
          </DropdownMenuItem>
        )}
        {canDelete && (
          <DropdownMenuItem variant="destructive" onSelect={() => onDelete(row)}>
            <Icon name="trash" />
            Delete
          </DropdownMenuItem>
        )}
      </>
    )
  };
};

export const SubOrgsTab = () => {
  const go = useGo();
  const { permission } = useOrgPermission();
  const adapter = useV4Adapter("orgSettings");
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search.trim());
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const { data, isPending } = adapter.useSubOrganizations({
    search: debounced || undefined,
    orderBy: SubOrgOrderBy.Name,
    orderDirection: direction === "asc" ? OrderByDirection.ASC : OrderByDirection.DESC,
    limit: perPage,
    offset: (page - 1) * perPage
  });
  const { data: accessible } = adapter.useSubOrganizations({ isAccessible: true });
  const [editing, setEditing] = useState<Editing>();
  const [removing, setRemoving] = useState<TSubOrganization>();

  const canCreate = permission.can(
    OrgPermissionSubOrgActions.Create,
    OrgPermissionSubjects.SubOrganization
  );
  const canEdit = permission.can(
    OrgPermissionSubOrgActions.Edit,
    OrgPermissionSubjects.SubOrganization
  );
  const canDelete = permission.can(
    OrgPermissionSubOrgActions.Delete,
    OrgPermissionSubjects.SubOrganization
  );
  const canJoin = permission.can(
    OrgPermissionSubOrgActions.DirectAccess,
    OrgPermissionSubjects.SubOrganization
  );
  const memberIds = new Set((accessible?.organizations ?? []).map((entry) => entry.id));
  const rows = data?.organizations ?? [];
  const total = data?.totalCount ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  if (page > pageCount && !isPending) setPage(pageCount);

  const columns = subOrgColumns({
    memberIds,
    canJoin,
    linkOf: (subOrg) => go.link(orgHref(subOrg.id, "/projects"))
  });

  const searching = Boolean(debounced);
  const hasRows = isPending || rows.length > 0;

  return (
    <Stack gap={24}>
      <PageHeader title="Sub-organizations" />
      <Card
        variant="framed"
        title="Sub-organizations"
        flush={hasRows}
        action={
          <Inline gap={8} wrap={false}>
            <ListToolbar
              search={search}
              onSearch={(value) => {
                setSearch(value);
                setPage(1);
              }}
              placeholder="Search sub-organizations"
            />
            <Gate allowed={canCreate}>
              <Button
                variant="accent"
                icon="plus"
                disabled={!canCreate}
                onClick={() => setEditing({ mode: "create" })}
              >
                Add sub-organization
              </Button>
            </Gate>
          </Inline>
        }
      >
        {hasRows ? (
          <DataTable
            label="Sub-organizations"
            rows={rows}
            columns={columns}
            loading={isPending}
            getRowId={(row) => row.id}
            rowLabel={(row) => row.name}
            sort={{ columnId: "name", direction }}
            onSortChange={(next) => setDirection(next.direction)}
            rowActions={subOrgActions({
              canEdit,
              canDelete,
              onEdit: (subOrg) => setEditing({ mode: "edit", subOrg }),
              onDelete: setRemoving
            })}
            pagination={
              total > 0 ? (
                <Pagination
                  variant="compact"
                  page={page}
                  pageCount={pageCount}
                  total={total}
                  pageSize={perPage}
                  pageSizeOptions={PAGE_SIZES}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => {
                    setPerPage(size);
                    setPage(1);
                  }}
                />
              ) : undefined
            }
          />
        ) : (
          <EmptyState
            size="sm"
            icon={searching ? "search" : "building"}
            title={searching ? "No sub-organizations match this search" : "No sub-organizations"}
          />
        )}
      </Card>
      {editing && (
        <SubOrgDialog
          key={editing.mode === "edit" ? editing.subOrg.id : "create"}
          editing={editing}
          onClose={() => setEditing(undefined)}
        />
      )}
      <DeleteSubOrgDialog subOrg={removing} onClose={() => setRemoving(undefined)} />
    </Stack>
  );
};
