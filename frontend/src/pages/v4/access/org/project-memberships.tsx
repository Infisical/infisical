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
} from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@app/components/v4/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { DropdownMenuItem } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { Select } from "@app/components/v4/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { FilterReturnedProjects } from "@app/hooks/api/groups/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectAccessControlTabs } from "@app/types/project";

import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { productOf, projectBase } from "../../shell/navigation";
import { useGo } from "../navigation";
import { useOrgId } from "../permissions";
import { formatDate, grantLabel, type RoleGrant } from "../roles";
import { failed, saved } from "../toast";
import { Gate, RESTRICTED, usePagedList } from "../ui";
import { Section } from "./detail-parts";

import css from "./org.module.css";

export type MembershipSubject = "user" | "identity" | "group";

type MembershipProject = { id: string; name: string; type: ProjectType };

export type ProjectMembershipRow = {
  id: string;
  project: MembershipProject;
  roles: readonly RoleGrant[];
  createdAt: string;
};

const copy = {
  user: {
    emptyTitle: "This user is not a member of any projects",
    added: "Successfully added user to project",
    removed: () => "Successfully removed user from project",
    projectTab: ProjectAccessControlTabs.Member
  },
  identity: {
    emptyTitle: "This machine identity is not a member of any projects",
    added: "Successfully added identity to project",
    removed: () => "Successfully removed identity from project",
    projectTab: ProjectAccessControlTabs.Identities
  },
  group: {
    emptyTitle: "This group is not a member of any projects",
    added: "",
    removed: (project: string) => `Successfully removed the group from project ${project}`,
    projectTab: ProjectAccessControlTabs.Groups
  }
} as const;

const typeName = (type: ProjectType) => productOf(type).label;

const AddToProjectDialog = ({
  subject,
  open,
  onOpenChange,
  available,
  onAdd
}: {
  subject: "user" | "identity";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  available: readonly MembershipProject[];
  onAdd: (projectId: string, role: string) => Promise<void>;
}) => {
  const access = useV4Adapter("access");
  const [project, setProject] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState<{ project?: string; role?: string }>({});
  const { data: roles = [] } = access.useProjectRoles(project);
  const close = (next: boolean) => {
    if (!next) {
      setProject("");
      setRole("");
      setError({});
    }
    onOpenChange(next);
  };
  const isUser = subject === "user";
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isUser ? "Add user to project" : "Add machine identity to project"}
          </DialogTitle>
        </DialogHeader>
        <form
          id={`add-${subject}-to-project`}
          onSubmit={async (event) => {
            event.preventDefault();
            const next = {
              project: project ? undefined : "Required",
              role: isUser || role ? undefined : "Required"
            };
            setError(next);
            if (next.project || next.role) return;
            await onAdd(project, isUser ? "member" : role);
            close(false);
          }}
        >
          <Stack gap={16}>
            <Field label="Project" error={error.project}>
              <Select
                label="Project"
                placeholder={
                  available.length
                    ? "Select project..."
                    : `This ${isUser ? "user" : "identity"} is already a member of every project you can access.`
                }
                value={project}
                invalid={Boolean(error.project)}
                disabled={!available.length}
                options={available.map((item) => ({
                  value: item.id,
                  label: item.name,
                  group: typeName(item.type)
                }))}
                onChange={(value) => {
                  setProject(value);
                  setRole("");
                  setError({});
                }}
              />
            </Field>
            {!isUser && (
              <Field label="Role" error={error.role}>
                <Select
                  label="Role"
                  placeholder="Select role..."
                  value={role}
                  invalid={Boolean(error.role)}
                  disabled={!project}
                  options={roles.map((item) => ({
                    value: item.slug,
                    label: item.name,
                    description: item.description ?? undefined
                  }))}
                  onChange={(value) => {
                    setRole(value);
                    setError({});
                  }}
                />
              </Field>
            )}
          </Stack>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={`add-${subject}-to-project`}>
            Add to project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const AddGroupProjectsSheet = ({
  open,
  onOpenChange,
  available,
  canEdit,
  onAssign
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  available: readonly MembershipProject[];
  canEdit: boolean;
  onAssign: (project: MembershipProject) => Promise<void>;
}) => {
  const list = usePagedList({
    rows: available,
    perPage: 10,
    initialSort: { columnId: "name", direction: "asc" },
    matches: (project, needle) => project.name.toLowerCase().includes(needle),
    compare: (a, b) => a.name.localeCompare(b.name)
  });
  const columns: DataTableColumn<MembershipProject>[] = [
    {
      id: "name",
      header: "Project",
      render: (project) => (
        <span className={css.projectCell}>
          <span>{project.name}</span>
        </span>
      )
    },
    { id: "type", header: "Type", width: 180, render: (project) => typeName(project.type) },
    {
      id: "actions",
      header: "Actions",
      actions: true,
      render: (project) => (
        <Gate allowed={canEdit}>
          <Button variant="outline" disabled={!canEdit} onClick={() => onAssign(project)}>
            Assign
          </Button>
        </Gate>
      )
    }
  ];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Add projects</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <Stack gap={16}>
            <Input
              icon="search"
              placeholder="Search projects..."
              aria-label="Search projects"
              value={list.search}
              onChange={(event) => list.setSearch(event.target.value)}
            />
            <DataTable
              label="Projects to add"
              rows={list.pageRows}
              columns={columns}
              getRowId={(project) => project.id}
              rowLabel={(project) => project.name}
              empty={
                <EmptyState
                  size="sm"
                  icon="folder"
                  title={
                    list.search.trim()
                      ? "No projects match search"
                      : "This group is already a part of all projects"
                  }
                />
              }
            />
            {list.pagination}
          </Stack>
        </SheetBody>
      </SheetContent>
    </Sheet>
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
  const groups = access.useGroupProjects({
    id: subject === "group" ? subjectId : "",
    offset: 0,
    limit: 100,
    search: "",
    filter: FilterReturnedProjects.ASSIGNED_PROJECTS
  });
  const rows = useMemo((): ProjectMembershipRow[] => {
    if (subject === "user")
      return (users.data ?? []).map((entry) => ({
        id: entry.id,
        project: entry.project,
        roles: entry.roles,
        createdAt: entry.createdAt
      }));
    if (subject === "identity")
      return (identities.data ?? []).map((entry) => ({
        id: entry.id,
        project: entry.project,
        roles: entry.roles,
        createdAt: entry.createdAt
      }));
    return (groups.data?.projects ?? []).map((entry) => ({
      id: entry.id,
      project: { id: entry.id, name: entry.name, type: entry.type as ProjectType },
      roles: [],
      createdAt: entry.joinedGroupAt ? String(entry.joinedGroupAt) : ""
    }));
  }, [subject, users.data, identities.data, groups.data]);
  const pending = { user: users, identity: identities, group: groups }[subject].isPending;
  return { rows, isPending: pending };
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
  const access = useV4Adapter("access");
  const orgId = useOrgId();
  const go = useGo();
  const { projects } = useV4Session();
  const text = copy[subject];
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ProjectMembershipRow>();
  const { rows: memberships, isPending } = useMembershipRows(subject, subjectId);
  const addUsers = access.useAddProjectUsers();
  const addIdentity = access.useAddProjectIdentity();
  const addGroup = access.useAddProjectGroup();
  const removeUsers = access.useRemoveProjectUsers();
  const removeIdentity = access.useRemoveProjectIdentity();
  const removeGroup = access.useRemoveProjectGroup();
  const available = projects.filter(
    (project) => !memberships.some((membership) => membership.project.id === project.id)
  );
  const list = usePagedList({
    rows: memberships,
    perPage: subject === "user" ? 10 : 20,
    initialSort: { columnId: "name", direction: "asc" },
    matches: (row, needle) => row.project.name.toLowerCase().includes(needle),
    compare: (a, b) => a.project.name.localeCompare(b.project.name)
  });
  const openProject = (row: ProjectMembershipRow) =>
    go(
      `/v4/organizations/${orgId}${projectBase(row.project.type, row.project.id)}/access-management?selectedTab=${text.projectTab}`
    );
  const roleLabel = (row: ProjectMembershipRow) =>
    row.roles.length
      ? `${grantLabel(row.roles[0])}${row.roles.length > 1 ? ` (+${row.roles.length - 1})` : ""}`
      : "";

  const add = async (projectId: string, role: string) => {
    try {
      if (subject === "user")
        await addUsers.mutateAsync({
          projectId,
          orgId,
          usernames: [username ?? ""],
          roleSlugs: [role]
        });
      else if (subject === "identity")
        await addIdentity.mutateAsync({ identityId: subjectId, projectId, role });
      else await addGroup.mutateAsync({ groupId: subjectId, projectId, role });
      return true;
    } catch (error) {
      failed("Failed to add to project", error);
      return false;
    }
  };

  const remove = async (row: ProjectMembershipRow) => {
    try {
      if (subject === "user")
        await removeUsers.mutateAsync({
          projectId: row.project.id,
          orgId,
          usernames: [username ?? ""]
        });
      else if (subject === "identity")
        await removeIdentity.mutateAsync({ identityId: subjectId, projectId: row.project.id });
      else await removeGroup.mutateAsync({ groupId: subjectId, projectId: row.project.id });
      saved(text.removed(row.project.name));
    } catch (error) {
      failed("Failed to remove from project", error);
    }
  };

  const columns: DataTableColumn<ProjectMembershipRow>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      grow: true,
      render: (row) => <span>{row.project.name}</span>
    },
    subject === "group"
      ? { id: "type", header: "Type", render: (row) => typeName(row.project.type) }
      : { id: "role", header: "Role", render: roleLabel },
    ...(subject === "user"
      ? []
      : [
          {
            id: "added",
            header: "Added on",
            render: (row: ProjectMembershipRow) => formatDate(row.createdAt)
          }
        ])
  ];

  const rowActions: DataTableRowActions<ProjectMembershipRow> = {
    inline: [{ label: "Access project", icon: "external", onSelect: openProject }],
    renderMenu: (row) => (
      <DropdownMenuItem
        variant="destructive"
        disabled={!canEdit}
        description={canEdit ? undefined : RESTRICTED}
        onSelect={() => setRemoving(row)}
      >
        <Icon name="trash" />
        Remove from project
      </DropdownMenuItem>
    )
  };

  const addButton = (variant: "outline" | "primary") => (
    <Gate allowed={canEdit}>
      <Button
        variant={variant}
        size="sm"
        icon="plus"
        disabled={!canEdit}
        onClick={() => setAdding(true)}
      >
        Add to project
      </Button>
    </Gate>
  );
  const showHeaderAdd = canAdd && (subject === "group" || memberships.length > 0);
  const searching = Boolean(list.search.trim());

  return (
    <Section title="Projects" action={showHeaderAdd ? addButton("outline") : undefined}>
      <Input
        icon="search"
        placeholder="Search projects..."
        aria-label={`Search ${subjectName} projects`}
        value={list.search}
        onChange={(event) => list.setSearch(event.target.value)}
      />
      <DataTable
        label={`Projects for ${subjectName}`}
        rows={list.pageRows}
        columns={columns}
        loading={isPending}
        rowActions={rowActions}
        getRowId={(row) => row.id}
        rowLabel={(row) => row.project.name}
        sort={list.sort}
        onSortChange={list.setSort}
        onRowActivate={openProject}
        empty={
          searching ? (
            <EmptyState size="sm" icon="search" title="No projects match this search" />
          ) : (
            <EmptyState
              size="sm"
              icon="folder"
              title={text.emptyTitle}
              actions={canAdd ? addButton("primary") : undefined}
            />
          )
        }
      />
      {list.pagination}
      {subject === "group" ? (
        <AddGroupProjectsSheet
          open={adding}
          onOpenChange={setAdding}
          available={available}
          canEdit={canEdit}
          onAssign={async (project) => {
            if (await add(project.id, "no-access"))
              saved(`Successfully assigned the group to project ${project.name}`);
          }}
        />
      ) : (
        <AddToProjectDialog
          subject={subject}
          open={adding}
          onOpenChange={setAdding}
          available={available}
          onAdd={async (projectId, role) => {
            if (await add(projectId, role)) saved(text.added);
          }}
        />
      )}
      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText={subject === "user" ? "remove" : "confirm"}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {subject === "user" &&
                `Do you want to remove this user from ${removing?.project.name ?? ""}?`}
              {subject === "identity" && "Remove identity from project"}
              {subject === "group" &&
                `Are you sure you want to remove the group from ${removing?.project.name ?? ""}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {subject === "user" && "They lose their direct access to this project."}
              {subject === "identity" &&
                `${subjectName} loses its access to ${removing?.project.name ?? "this project"}.`}
              {subject === "group" && "Members lose access granted through this group."}
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
              {subject === "identity" ? "Remove from project" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
};
