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
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
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

import { useAccess } from "../context";
import {
  CURRENT_PROJECT_ID,
  type OrgProject,
  orgProjects,
  projectTypeNames,
  roleName
} from "../model";
import { Gate, Muted, usePagedList } from "../ui";
import { Section } from "./detail-parts";
import {
  addProjectMembership,
  listProjectMemberships,
  type MembershipSubject,
  type ProjectMembershipRow,
  removeProjectMembership
} from "./memberships";

import css from "./org.module.css";

const PREVIEW_ONLY = "This preview only includes the payments-api project";

const copy = {
  user: {
    description: "Manage user project memberships",
    emptyTitle: "This user is not a member of any projects",
    emptyDescription: "Assign this user to a project.",
    added: "Successfully added user to project",
    removed: () => "Successfully removed user from project",
    projectTab: "members"
  },
  identity: {
    description: "Manage machine identity project memberships",
    emptyTitle: "This machine identity is not a member of any projects",
    emptyDescription: "Assign this machine identity to a project.",
    added: "Successfully added identity to project",
    removed: () => "Successfully removed identity from project",
    projectTab: "identities"
  },
  group: {
    description: "Manage group project memberships",
    emptyTitle: "This group is not a member of any projects",
    emptyDescription: "Add this group to a project.",
    added: "",
    removed: (project: string) => `Successfully removed the group from project ${project}`,
    projectTab: "groups"
  }
} as const;

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
  available: readonly OrgProject[];
  onAdd: (projectId: string, role: string) => void;
}) => {
  const { data } = useAccess();
  const [project, setProject] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState<{ project?: string; role?: string }>({});
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
          <DialogDescription>
            {isUser
              ? "Select a project to add this user to."
              : "Select a project and the role this machine identity should have in it."}
          </DialogDescription>
        </DialogHeader>
        <form
          id={`add-${subject}-to-project`}
          onSubmit={(event) => {
            event.preventDefault();
            const next = {
              project: project ? undefined : "Required",
              role: isUser || role ? undefined : "Required"
            };
            setError(next);
            if (next.project || next.role) return;
            onAdd(project, isUser ? "member" : role);
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
                  group: projectTypeNames[item.type]
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
                  options={data.projectRoles.map((item) => ({
                    value: item.slug,
                    label: item.name,
                    description: item.description
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
  available: readonly OrgProject[];
  canEdit: boolean;
  onAssign: (project: OrgProject) => void;
}) => {
  const list = usePagedList({
    rows: available,
    perPage: 10,
    initialSort: { columnId: "name", direction: "asc" },
    matches: (project, needle) => project.name.toLowerCase().includes(needle),
    compare: (a, b) => a.name.localeCompare(b.name)
  });
  const columns: DataTableColumn<OrgProject>[] = [
    {
      id: "name",
      header: "Project",
      render: (project) => (
        <span className={css.projectCell}>
          <span>{project.name}</span>
          {project.description && <Muted>{project.description}</Muted>}
        </span>
      )
    },
    { id: "type", header: "Type", width: 180, render: (project) => projectTypeNames[project.type] },
    {
      id: "actions",
      header: "Actions",
      actions: true,
      render: (project) => (
        <Gate allowed={canEdit}>
          <Button variant="outline" size="xs" disabled={!canEdit} onClick={() => onAssign(project)}>
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

export const ProjectMembershipsSection = ({
  subject,
  subjectId,
  subjectName,
  canEdit,
  canAdd = true,
  startAdding = false
}: {
  subject: MembershipSubject;
  subjectId: string;
  subjectName: string;
  canEdit: boolean;
  canAdd?: boolean;
  startAdding?: boolean;
}) => {
  const { data, update, saved, toast, navigate } = useAccess();
  const text = copy[subject];
  const [adding, setAdding] = useState(startAdding);
  const [removing, setRemoving] = useState<ProjectMembershipRow>();
  const memberships = useMemo(
    () => listProjectMemberships(data, subject, subjectId),
    [data, subject, subjectId]
  );
  const available = orgProjects.filter(
    (project) =>
      project.type !== "cert-manager" && !memberships.some((m) => m.project.id === project.id)
  );
  const list = usePagedList({
    rows: memberships,
    perPage: subject === "user" ? 10 : 20,
    initialSort: { columnId: "name", direction: "asc" },
    matches: (row, needle) => row.project.name.toLowerCase().includes(needle),
    compare: (a, b) => a.project.name.localeCompare(b.project.name)
  });
  const openProject = () => navigate({ scope: "project", projectTab: text.projectTab });
  const roleLabel = (row: ProjectMembershipRow) =>
    `${roleName(data.projectRoles, row.roles[0])}${row.roles.length > 1 ? ` (+${row.roles.length - 1})` : ""}`;

  const columns: DataTableColumn<ProjectMembershipRow>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      grow: true,
      render: (row) => <span>{row.project.name}</span>
    },
    subject === "group"
      ? { id: "type", header: "Type", render: (row) => projectTypeNames[row.project.type] }
      : { id: "role", header: "Role", render: roleLabel },
    ...(subject === "user"
      ? []
      : [
          { id: "added", header: "Added on", render: (row: ProjectMembershipRow) => row.createdAt }
        ]),
    {
      id: "actions",
      header: "Actions",
      actions: true,
      render: (row) => {
        const isCurrent = row.project.id === CURRENT_PROJECT_ID;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-row" icon="more" iconOnly>
                {`Actions for ${row.project.name}`}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={!isCurrent}
                description={isCurrent ? undefined : PREVIEW_ONLY}
                onSelect={openProject}
              >
                <Icon name="external" />
                Access project
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={!canEdit}
                onSelect={() => setRemoving(row)}
              >
                <Icon name="trash" />
                Remove from project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      }
    }
  ];

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
    <Section
      title="Projects"
      description={text.description}
      action={showHeaderAdd ? addButton("outline") : undefined}
    >
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
        getRowId={(row) => row.id}
        rowLabel={(row) => row.project.name}
        sort={list.sort}
        onSortChange={list.setSort}
        onRowActivate={(row) =>
          row.project.id === CURRENT_PROJECT_ID
            ? openProject()
            : toast({ tone: "bad", title: "Unable to access project", description: PREVIEW_ONLY })
        }
        empty={
          searching ? (
            <EmptyState
              size="sm"
              icon="search"
              title="No projects match this search"
              description="Adjust search filters to view project memberships."
            />
          ) : (
            <EmptyState
              size="sm"
              icon="folder"
              title={text.emptyTitle}
              description={text.emptyDescription}
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
          onAssign={(project) => {
            update((current) =>
              addProjectMembership(current, "group", subjectId, project.id, "no-access")
            );
            saved(`Successfully assigned the group to project ${project.name}`);
          }}
        />
      ) : (
        <AddToProjectDialog
          subject={subject}
          open={adding}
          onOpenChange={setAdding}
          available={available}
          onAdd={(projectId, role) => {
            update((current) => addProjectMembership(current, subject, subjectId, projectId, role));
            saved(text.added);
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
              {subject === "identity"
                ? `Remove ${subjectName} from ${removing?.project.name ?? "this project"}. The identity loses all access it has through this project membership.`
                : "This action is irreversible."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!removing) return;
                update((current) =>
                  removeProjectMembership(current, subject, subjectId, removing.project.id)
                );
                saved(text.removed(removing.project.name));
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
