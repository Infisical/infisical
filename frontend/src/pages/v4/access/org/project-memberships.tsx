import { useMemo, useState } from "react";
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
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { DropdownMenuItem } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { MultiSelect } from "@infisical/cipher/ui/multi-select";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { Select } from "@infisical/cipher/ui/select";

import { ProjectType, ProjectVersion } from "@app/hooks/api/projects/types";
import { ProjectAccessControlTabs } from "@app/types/project";

import { useV4Adapter } from "../../data/adapters";
import { orgHref } from "../../links";
import { productOf, projectBase } from "../../shell/navigation";
import { useGo } from "../navigation";
import { useOrgId } from "../permissions";
import { formatDate, grantLabel, roleOptions, type RoleGrant } from "../roles";
import { failed, saved, toast } from "../toast";
import { Gate, ListToolbar, RESTRICTED, usePagedList } from "../ui";
import { builtInProjectRoles, type Product, PRODUCTS, useIsNamedByProduct } from "./products";

export type MembershipSubject = "user" | "identity" | "group";

type MembershipProject = { id: string; name: string; type: ProjectType };

export type ProjectMembershipRow = {
  id: string;
  project: MembershipProject;
  roles: readonly RoleGrant[];
  createdAt: string;
};

type SubjectCopy = {
  actor: string;
  title: string;
  emptyTitle: string;
  projectTab: ProjectAccessControlTabs;
  confirmText: string;
  removeTitle: (label: string) => string;
  removeDescription: (name: string, label: string) => string;
};

const copy: Record<MembershipSubject, SubjectCopy> = {
  user: {
    actor: "user",
    title: "Add user to product",
    emptyTitle: "This user does not have access to any products",
    projectTab: ProjectAccessControlTabs.Member,
    confirmText: "remove",
    removeTitle: (label: string) => `Do you want to remove this user from ${label}?`,
    removeDescription: () => "They lose their direct access to it."
  },
  identity: {
    actor: "machine identity",
    title: "Add machine identity to product",
    emptyTitle: "This machine identity does not have access to any products",
    projectTab: ProjectAccessControlTabs.Identities,
    confirmText: "confirm",
    removeTitle: () => "Remove machine identity",
    removeDescription: (name: string, label: string) =>
      `${name} loses all access it has through this membership in ${label}.`
  },
  group: {
    actor: "group",
    title: "Add group to product",
    emptyTitle: "This group does not have access to any products",
    projectTab: ProjectAccessControlTabs.Groups,
    confirmText: "confirm",
    removeTitle: (label: string) => `Are you sure you want to remove the group from ${label}?`,
    removeDescription: () => "Members lose access granted through this group."
  }
};

const productName = (type: ProjectType) => productOf(type).label;

const DEFAULT_ROLE = "member";

const useRoleChoices = (product: Product | undefined, targets: MembershipProject[]) => {
  const singleTarget = targets.length === 1 ? targets[0].id : "";
  const { data: singleRoles } = useV4Adapter("access").useProjectRoles(
    product?.roles ? "" : singleTarget
  );
  if (product?.roles) return [...product.roles];
  if (singleTarget && singleRoles) return roleOptions(singleRoles);
  return builtInProjectRoles(product?.type);
};

const reportAdded = (
  results: PromiseSettledResult<unknown>[],
  actor: string,
  productLabel: string
) => {
  const rejected = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
  if (rejected.length === results.length) {
    failed(`Failed to add ${actor} to ${productLabel}`, rejected[0].reason);
    return false;
  }
  if (rejected.length)
    toast({
      tone: "neutral",
      title: `Added ${actor} to ${results.length - rejected.length} of ${results.length} ${productLabel} projects`
    });
  else saved(`Successfully added ${actor} to ${productLabel}`);
  return true;
};

const useAvailableProjects = (subject: MembershipSubject, memberProjectIds: readonly string[]) => {
  const orgId = useOrgId();
  const { data: projects = [], isPending: projectsPending } =
    useV4Adapter("projects").useUserProjects();
  const availableByType = useMemo(() => {
    const members = new Set(memberProjectIds);
    const grouped = new Map<ProjectType, MembershipProject[]>();
    projects
      .filter(
        (project) =>
          !members.has(project.id) &&
          project.orgId === orgId &&
          !(subject === "user" && project.version === ProjectVersion.V1)
      )
      .forEach((project) =>
        grouped.set(project.type, [
          ...(grouped.get(project.type) ?? []),
          { id: project.id, name: project.name, type: project.type }
        ])
      );
    return grouped;
  }, [projects, memberProjectIds, orgId, subject]);
  return { availableByType, projectsPending };
};

const AddToProductDialog = ({
  subject,
  open,
  onOpenChange,
  memberProjectIds,
  membershipsReady,
  onAdd
}: {
  subject: MembershipSubject;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberProjectIds: readonly string[];
  membershipsReady: boolean;
  onAdd: (project: MembershipProject, role: string) => Promise<unknown>;
}) => {
  const { availableByType, projectsPending } = useAvailableProjects(subject, memberProjectIds);
  const isNamedByProduct = useIsNamedByProduct();
  const [productType, setProductType] = useState<ProjectType>();
  const [selected, setSelected] = useState<string[]>([]);
  const [role, setRole] = useState(DEFAULT_ROLE);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const text = copy[subject];

  const availableProducts = PRODUCTS.filter((product) => availableByType.has(product.type));
  const product = PRODUCTS.find((entry) => entry.type === productType);
  const productProjects = productType ? (availableByType.get(productType) ?? []) : [];
  const pickerShown =
    Boolean(productType) && !(isNamedByProduct(productType!) && productProjects.length === 1);
  const selectedIds = new Set(selected);
  const targets = pickerShown
    ? productProjects.filter((project) => selectedIds.has(project.id))
    : productProjects;
  const roleChoices = useRoleChoices(product, targets);

  const reset = () => {
    setProductType(undefined);
    setSelected([]);
    setRole(DEFAULT_ROLE);
    setError(undefined);
  };
  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const submit = async () => {
    if (!product) {
      setError("Select a product");
      return;
    }
    if (!targets.length) {
      setError("Select at least one project");
      return;
    }
    setPending(true);
    let results: PromiseSettledResult<unknown>[];
    try {
      results = await Promise.allSettled(targets.map((project) => onAdd(project, role)));
    } finally {
      setPending(false);
    }
    if (reportAdded(results, text.actor, productName(product.type))) close(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>{text.title}</DialogTitle>
        </DialogHeader>
        <form
          id={`add-${subject}-to-product`}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Stack gap={16}>
            <Field label="Product" error={product ? undefined : error}>
              <Select
                label="Product"
                placeholder={
                  projectsPending || !membershipsReady || availableProducts.length
                    ? "Select a product..."
                    : "Already a member of everything you can access"
                }
                value={productType ?? ""}
                invalid={Boolean(error && !product)}
                disabled={projectsPending || !membershipsReady || !availableProducts.length}
                options={availableProducts.map((entry) => ({
                  value: entry.type,
                  label: productName(entry.type)
                }))}
                onChange={(value) => {
                  setProductType(value as ProjectType);
                  setSelected([]);
                  setRole(DEFAULT_ROLE);
                  setError(undefined);
                }}
              />
            </Field>
            {pickerShown && (
              <Field label="Projects" error={product ? error : undefined}>
                <MultiSelect
                  label="Projects"
                  placeholder="Select projects..."
                  searchable
                  invalid={Boolean(error && product)}
                  options={productProjects.map((project) => ({
                    value: project.id,
                    label: project.name
                  }))}
                  value={selected}
                  onChange={(next) => {
                    setSelected(next);
                    setRole(DEFAULT_ROLE);
                    setError(undefined);
                  }}
                />
              </Field>
            )}
            {product && (
              <Field
                label="Role"
                description={
                  !product.roles && targets.length > 1
                    ? "Only built-in roles are available for multiple projects."
                    : undefined
                }
              >
                <Select label="Role" value={role} options={roleChoices} onChange={setRole} />
              </Field>
            )}
          </Stack>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form={`add-${subject}-to-product`}
            loading={pending}
            disabledReason={membershipsReady ? undefined : "Loading current memberships"}
          >
            Add to product
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const useMembershipRows = (subject: MembershipSubject, subjectId: string) => {
  const access = useV4Adapter("access");
  const orgId = useOrgId();
  const users = access.useOrgMembershipProjectMemberships(
    orgId,
    subject === "user" ? subjectId : ""
  );
  const identities = access.useIdentityProjectMemberships(subject === "identity" ? subjectId : "");
  const groups = access.useGroupProjects(subject === "group" ? subjectId : "");
  const rows = useMemo((): ProjectMembershipRow[] => {
    if (subject === "user")
      return (users.data?.memberships ?? []).map((entry) => ({
        id: entry.id,
        project: entry.project,
        roles: entry.roles,
        createdAt: entry.createdAt
      }));
    if (subject === "identity")
      return (identities.data?.identityMemberships ?? []).map((entry) => ({
        id: entry.id,
        project: entry.project,
        roles: entry.roles,
        createdAt: entry.createdAt
      }));
    return (groups.data ?? []).map((entry) => ({
      id: entry.id,
      project: { id: entry.id, name: entry.name, type: entry.type as ProjectType },
      roles: [],
      createdAt: entry.joinedGroupAt ? String(entry.joinedGroupAt) : ""
    }));
  }, [subject, users.data, identities.data, groups.data]);
  const query = { user: users, identity: identities, group: groups }[subject];
  return { rows, isPending: query.isPending, error: query.error };
};

const useMembershipMutations = (
  subject: MembershipSubject,
  subjectId: string,
  username?: string
) => {
  const access = useV4Adapter("access");
  const orgId = useOrgId();
  const addUsers = access.useAddProjectUsers();
  const addIdentity = access.useAddProjectIdentity();
  const addGroup = access.useAddProjectGroup();
  const removeUsers = access.useRemoveProjectUsers();
  const removeIdentity = access.useRemoveProjectIdentity();
  const removeGroup = access.useRemoveProjectGroup();

  const add = (project: MembershipProject, role: string) => {
    if (subject === "user")
      return addUsers.mutateAsync({
        projectId: project.id,
        projectType: project.type,
        orgId,
        usernames: [username ?? ""],
        roleSlugs: [role]
      });
    if (subject === "identity")
      return addIdentity.mutateAsync({
        identityId: subjectId,
        projectId: project.id,
        projectType: project.type,
        role
      });
    return addGroup.mutateAsync({
      groupId: subjectId,
      projectId: project.id,
      projectType: project.type,
      role
    });
  };

  const remove = ({ id: projectId, type: projectType }: MembershipProject) => {
    if (subject === "user")
      return removeUsers.mutateAsync({
        projectId,
        projectType,
        orgId,
        usernames: [username ?? ""]
      });
    if (subject === "identity")
      return removeIdentity.mutateAsync({ identityId: subjectId, projectId, projectType });
    return removeGroup.mutateAsync({ groupId: subjectId, projectId, projectType });
  };

  return { add, remove };
};

export const ProjectMembershipsSection = ({
  subject,
  subjectId,
  subjectName,
  username,
  canEdit,
  canAdd = true
}: {
  subject: MembershipSubject;
  subjectId: string;
  subjectName: string;
  username?: string;
  canEdit: boolean;
  canAdd?: boolean;
}) => {
  const go = useGo();
  const orgId = useOrgId();
  const isNamedByProduct = useIsNamedByProduct();
  const text = copy[subject];
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ProjectMembershipRow>();
  const { rows: memberships, isPending, error } = useMembershipRows(subject, subjectId);
  const { add, remove: removeMembership } = useMembershipMutations(subject, subjectId, username);
  const list = usePagedList({
    rows: memberships,
    perPage: subject === "user" ? 10 : 20,
    initialSort: { columnId: "project", direction: "asc" },
    matches: (row, needle) => row.project.name.toLowerCase().includes(needle),
    compare: (a, b) => a.project.name.localeCompare(b.project.name)
  });
  const labelOf = (row: ProjectMembershipRow) =>
    isNamedByProduct(row.project.type) ? productName(row.project.type) : row.project.name;
  const projectHref = (row: ProjectMembershipRow) =>
    orgHref(
      orgId,
      `${projectBase(row.project.type, row.project.id)}/access-management?selectedTab=${text.projectTab}`
    );
  const roleLabel = (row: ProjectMembershipRow) =>
    row.roles.length
      ? `${grantLabel(row.roles[0])}${row.roles.length > 1 ? ` (+${row.roles.length - 1})` : ""}`
      : "";

  const remove = async (row: ProjectMembershipRow) => {
    try {
      await removeMembership(row.project);
      saved(`Successfully removed the ${text.actor} from ${labelOf(row)}`);
    } catch (err) {
      failed(`Failed to remove the ${text.actor} from ${labelOf(row)}`, err);
    }
  };

  const columns: DataTableColumn<ProjectMembershipRow>[] = [
    {
      id: "product",
      header: "Product",
      width: 280,
      text: (row) => productName(row.project.type),
      render: (row) => (
        <RowLink link={go.link(projectHref(row))} title={labelOf(row)}>
          <Inline gap={8} align="center" wrap={false}>
            <Icon name={productOf(row.project.type).icon} />
            {productName(row.project.type)}
          </Inline>
        </RowLink>
      )
    },
    {
      id: "project",
      header: "Project",
      sortable: true,
      grow: true,
      text: (row) => (isNamedByProduct(row.project.type) ? "-" : row.project.name),
      render: (row) => (isNamedByProduct(row.project.type) ? "-" : row.project.name)
    },
    ...(subject === "group" ? [] : [{ id: "role", header: "Role", width: 200, render: roleLabel }]),
    ...(subject === "user"
      ? []
      : [
          {
            id: "added",
            header: "Added on",
            width: 140,
            render: (row: ProjectMembershipRow) => formatDate(row.createdAt)
          }
        ])
  ];

  const rowActions: DataTableRowActions<ProjectMembershipRow> = {
    renderMenu: (row) => (
      <DropdownMenuItem
        variant="destructive"
        disabled={!canEdit}
        description={canEdit ? undefined : RESTRICTED}
        onSelect={() => setRemoving(row)}
      >
        <Icon name="trash" />
        {isNamedByProduct(row.project.type)
          ? `Remove from ${productName(row.project.type)}`
          : "Remove from project"}
      </DropdownMenuItem>
    )
  };

  const searching = Boolean(list.search.trim());
  const hasRows = isPending || list.pageRows.length > 0;
  const removingLabel = removing ? labelOf(removing) : "";

  let empty = <EmptyState size="sm" icon="folder" title={text.emptyTitle} />;
  if (error) empty = <EmptyState size="sm" icon="alert" title="Could not load products" />;
  else if (searching)
    empty = <EmptyState size="sm" icon="search" title="No memberships match this search" />;

  return (
    <>
      <Card
        variant="framed"
        title="Products"
        flush={hasRows}
        action={
          <Inline gap={8} wrap={false}>
            <ListToolbar
              search={list.search}
              onSearch={list.setSearch}
              placeholder="Search by project name"
            />
            {canAdd && (
              <Gate allowed={canEdit}>
                <Button
                  variant="accent"
                  icon="plus"
                  disabled={!canEdit}
                  onClick={() => setAdding(true)}
                >
                  Add to product
                </Button>
              </Gate>
            )}
          </Inline>
        }
      >
        {hasRows ? (
          <DataTable
            label={`Products for ${subjectName}`}
            rows={list.pageRows}
            columns={columns}
            loading={isPending}
            rowActions={rowActions}
            getRowId={(row) => row.id}
            rowLabel={labelOf}
            sort={list.sort}
            onSortChange={list.setSort}
            pagination={list.pagination}
          />
        ) : (
          empty
        )}
      </Card>
      <AddToProductDialog
        subject={subject}
        open={adding}
        onOpenChange={setAdding}
        memberProjectIds={memberships.map((row) => row.project.id)}
        membershipsReady={!isPending && !error}
        onAdd={add}
      />
      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText={text.confirmText}>
          <AlertDialogHeader>
            <AlertDialogTitle>{text.removeTitle(removingLabel)}</AlertDialogTitle>
            <AlertDialogDescription>
              {text.removeDescription(subjectName, removingLabel)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (!removing) return;
                await remove(removing);
                setRemoving(undefined);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
