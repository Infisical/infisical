import { useState } from "react";
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
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { SettingsCard } from "@infisical/cipher/ui/settings-card";
import { Switch } from "@infisical/cipher/ui/switch";
import { Textarea } from "@infisical/cipher/ui/textarea";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { z } from "zod";

import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { projectTypeToUrlSlug } from "@app/helpers/project";
import { type Project, ProjectType } from "@app/hooks/api/projects/types";
import { secretScanningV2Keys } from "@app/hooks/api/secretScanningV2/queries";

import { useProjectPermission } from "../../access/permissions";
import { useProjectScope } from "../../access/project/scope";
import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { orgHref, useGo } from "../../links";

const CONFIRM_KEYWORD = "confirm";
const RESTRICTED = "Your role doesn't allow this";

const DELETE_CONSEQUENCES: Partial<Record<ProjectType, string>> = {
  [ProjectType.AgentVault]:
    "Running agents and proxies stop working, and its session logs can no longer be viewed."
};

const detailsSchema = z.object({
  name: z.string().min(1, "Enter a project name").max(64, "Use 64 characters or fewer"),
  slug: z
    .string()
    .min(1, "Enter a project slug")
    .max(64, "Use 64 characters or fewer")
    .regex(
      /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/,
      "Use lowercase letters and numbers, with single hyphens or underscores between words"
    ),
  description: z.string().trim().max(1024, "Use 1024 characters or fewer")
});

type Details = z.infer<typeof detailsSchema>;

const detailsOf = (project: Project): Details => ({
  name: project.name,
  slug: project.slug,
  description: project.description ?? ""
});

const CopyTrailing = ({ value, label, done }: { value: string; label: string; done: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip content={label} side="top">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        icon={copied ? "check" : "copy"}
        iconOnly
        onClick={() => {
          navigator.clipboard?.writeText(value).catch(() => undefined);
          saved(done);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        }}
      >
        {label}
      </Button>
    </Tooltip>
  );
};

const ProjectDetails = ({ project, canEdit }: { project: Project; canEdit: boolean }) => {
  const updateProject = useV4Adapter("projectSettings").useUpdateProject();
  const [savedDetails, setSavedDetails] = useState(() => detailsOf(project));
  const [draft, setDraft] = useState(savedDetails);
  const dirty =
    draft.name !== savedDetails.name ||
    draft.slug !== savedDetails.slug ||
    draft.description !== savedDetails.description;
  const issues = dirty ? detailsSchema.safeParse(draft).error?.flatten().fieldErrors : undefined;
  return (
    <SettingsCard
      title="Project details"
      dirty={dirty}
      locked={canEdit ? undefined : RESTRICTED}
      onDiscard={() => setDraft(savedDetails)}
      onSave={async () => {
        if (issues) throw new Error("Fix the highlighted fields, then save again.");
        await updateProject.mutateAsync({
          projectId: project.id,
          newProjectName: draft.name,
          newSlug: draft.slug,
          newProjectDescription: draft.description.trim()
        });
        setSavedDetails(draft);
        saved("Project details saved");
      }}
    >
      <Stack gap={16}>
        <Field label="Project name" error={issues?.name?.[0]}>
          <Input
            value={draft.name}
            invalid={Boolean(issues?.name)}
            autoComplete="off"
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </Field>
        <Field label="Project slug" error={issues?.slug?.[0]}>
          <Input
            mono
            value={draft.slug}
            invalid={Boolean(issues?.slug)}
            autoComplete="off"
            onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
            trailing={
              <CopyTrailing value={draft.slug} label="Copy project slug" done="Slug copied" />
            }
          />
        </Field>
        <Field label="Project ID">
          <Input
            mono
            readOnly
            value={project.id}
            trailing={
              <CopyTrailing value={project.id} label="Copy project ID" done="Project ID copied" />
            }
          />
        </Field>
        <Field label="Description" error={issues?.description?.[0]}>
          <Textarea
            rows={3}
            value={draft.description}
            placeholder="What this project is for"
            aria-invalid={Boolean(issues?.description) || undefined}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
        </Field>
      </Stack>
    </SettingsCard>
  );
};

const DeleteProtection = ({ project, canEdit }: { project: Project; canEdit: boolean }) => {
  const updateProject = useV4Adapter("projectSettings").useUpdateProject();
  const [pending, setPending] = useState(false);
  return (
    <Card
      title="Delete protection"
      description={
        project.hasDeleteProtection
          ? "On. Turn it off before deleting this project."
          : "Off. Members with permission can delete this project."
      }
      action={
        <Switch
          aria-label="Delete protection"
          checked={project.hasDeleteProtection}
          disabled={!canEdit || pending}
          onCheckedChange={async (state) => {
            setPending(true);
            try {
              await updateProject.mutateAsync({
                projectId: project.id,
                hasDeleteProtection: state
              });
              saved(`Delete protection turned ${state ? "on" : "off"}`);
            } catch (error) {
              failed("Delete protection was not changed", error);
            } finally {
              setPending(false);
            }
          }}
        />
      }
    />
  );
};

const LeaveProject = ({
  project,
  isDirectMember
}: {
  project: Project;
  isDirectMember: boolean;
}) => {
  const go = useGo();
  const { orgId } = useProjectScope();
  const leaveProject = useV4Adapter("projects").useLeaveProject();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  return (
    <>
      <Card
        title="Leave project"
        description="Removes your access to this project and its contents."
        action={
          <Button
            variant="outline"
            size="sm"
            disabledReason={
              isDirectMember
                ? undefined
                : "You're a member through a group. Leave the group to remove access."
            }
            onClick={() => setOpen(true)}
          >
            Leave project
          </Button>
        }
      />
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent confirmText={CONFIRM_KEYWORD} pending={pending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave {project.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              You lose access to this project and its contents until someone adds you back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async (event) => {
                event.preventDefault();
                setPending(true);
                try {
                  await leaveProject.mutateAsync({ projectId: project.id });
                  setOpen(false);
                  saved(`You left ${project.name}`);
                  go(orgHref(orgId, "/projects"));
                } finally {
                  setPending(false);
                }
              }}
            >
              Leave project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

const DeleteProject = ({ project, canDelete }: { project: Project; canDelete: boolean }) => {
  const go = useGo();
  const queryClient = useQueryClient();
  const { orgId } = useProjectScope();
  const deleteProject = useV4Adapter("projectSettings").useDeleteProject();
  const [dialog, setDialog] = useState<"schedule" | "delete">();
  const [pending, setPending] = useState(false);
  const isRestorable = project.type === ProjectType.SecretManager;
  const consequence = DELETE_CONSEQUENCES[project.type];
  let blocked: string | undefined;
  if (!canDelete) blocked = RESTRICTED;
  else if (project.hasDeleteProtection)
    blocked = "Turn off delete protection before deleting this project.";

  const run = async (hardDelete: boolean) => {
    setPending(true);
    try {
      await deleteProject.mutateAsync({ projectID: project.id, hardDelete });
      saved(isRestorable && !hardDelete ? "Project scheduled for deletion" : "Project deleted");
      queryClient.removeQueries({ queryKey: secretScanningV2Keys.all });
      setDialog(undefined);
      go(orgHref(orgId, `/projects/${projectTypeToUrlSlug(project.type)}`));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <SettingsCard
        tone="danger"
        title="Delete project"
        description={
          isRestorable
            ? "Org admins can restore a deleted project for 14 days. After that, its data is gone."
            : "Permanently deletes this project and all of its data."
        }
        actions={
          <Button
            variant="destructive"
            size="sm"
            icon="trash"
            disabledReason={blocked}
            onClick={() => setDialog(isRestorable ? "schedule" : "delete")}
          >
            Delete project
          </Button>
        }
      />
      <AlertDialog
        open={dialog === "schedule"}
        onOpenChange={(open) => !open && setDialog(undefined)}
      >
        <AlertDialogContent tone="danger" pending={pending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Schedule deletion of {project.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It becomes inaccessible now and is permanently deleted on{" "}
              {format(addDays(new Date(), 14), "MMM d, yyyy")}. Org admins can restore it with its
              secrets, environments, and history until then.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="danger-ghost"
              size="sm"
              disabled={pending}
              onClick={() => setDialog("delete")}
            >
              Delete now
            </Button>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                run(false);
              }}
            >
              Schedule deletion
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={dialog === "delete"}
        onOpenChange={(open) => !open && setDialog(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText={CONFIRM_KEYWORD} pending={pending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete {project.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              All of its data is deleted and can&apos;t be recovered.
              {consequence ? ` ${consequence}` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                run(isRestorable);
              }}
            >
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export const ProjectGeneralSettings = ({
  adminOnlyDanger = false
}: {
  adminOnlyDanger?: boolean;
}) => {
  const { projectId } = useProjectScope();
  const { data: project } = useV4Adapter("projectSettings").useProject(projectId);
  const { permission, isPending } = useProjectPermission(projectId);
  const { data: facts } = useV4Adapter("projectSettings").useMembershipFacts(projectId);
  if (!project || isPending) return <SettingsCard title="Project details" loading />;
  const showDanger = !adminOnlyDanger || Boolean(facts?.isAdmin);
  return (
    <Stack gap={24}>
      <ProjectDetails
        key={project.id}
        project={project}
        canEdit={permission.can(ProjectPermissionActions.Edit, ProjectPermissionSub.Project)}
      />
      {showDanger && (
        <>
          <DeleteProtection
            project={project}
            canEdit={permission.can(ProjectPermissionActions.Edit, ProjectPermissionSub.Settings)}
          />
          <LeaveProject project={project} isDirectMember={Boolean(facts?.isDirectMember)} />
          <DeleteProject
            project={project}
            canDelete={permission.can(
              ProjectPermissionActions.Delete,
              ProjectPermissionSub.Project
            )}
          />
        </>
      )}
    </Stack>
  );
};
