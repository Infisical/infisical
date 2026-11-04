import { type ReactNode, useState } from "react";
import { ArrowRightIcon } from "lucide-react";

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
import { Combobox } from "@app/components/v4/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Stack } from "@app/components/v4/ui/layout";
import { Skeleton } from "@app/components/v4/ui/skeleton";
import { OrgAccessControlTabSections } from "@app/types/org";

import { useV4Adapter } from "../../data/adapters";
import { accessLinks } from "../links";
import { useGo } from "../navigation";
import { useOrgId } from "../permissions";
import { failed, saved } from "../toast";
import { PROJECT_TYPE } from "./member-access";

import styles from "./group.module.css";

const REQUIRED = "Required";
const FORM_ID = "add-project-group";
const GROUP_PAGE_SIZE = 100;

const Content = ({ projectId, onClose }: { projectId: string; onClose: () => void }) => {
  const orgId = useOrgId();
  const go = useGo();
  const access = useV4Adapter("access");
  const orgGroups = access.useOrgGroups({ organizationId: orgId, limit: GROUP_PAGE_SIZE });
  const projectGroups = access.useProjectGroups(projectId, PROJECT_TYPE);
  const roles = access.useProjectRoles(projectId, PROJECT_TYPE);
  const addGroup = access.useAddProjectGroup();
  const [groupId, setGroupId] = useState<string>();
  const [role, setRole] = useState<string>();
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);

  const loading = orgGroups.isPending || projectGroups.isPending || roles.isPending;
  const assigned = new Set((projectGroups.data ?? []).map((membership) => membership.group.id));
  const allGroups = orgGroups.data?.groups ?? [];
  const available = allGroups.filter((group) => !assigned.has(group.id));

  const submit = async () => {
    setSubmitted(true);
    if (!groupId || !role) return;
    setPending(true);
    try {
      await addGroup.mutateAsync({ projectId, projectType: PROJECT_TYPE, groupId, role });
      saved("Successfully added group to project");
      onClose();
    } catch (error) {
      failed("Failed to add group to project", error);
    } finally {
      setPending(false);
    }
  };

  const cancel = (
    <Button variant="ghost" onClick={onClose}>
      Cancel
    </Button>
  );
  let body: ReactNode;
  let footer: ReactNode;
  if (loading) {
    body = (
      <Stack gap={16} role="status" aria-label="Loading groups and roles">
        <Stack gap={8}>
          <span>Group</span>
          <Skeleton width="100%" height={32} />
        </Stack>
        <Stack gap={8}>
          <span>Role</span>
          <Skeleton width="100%" height={32} />
        </Stack>
      </Stack>
    );
    footer = (
      <>
        {cancel}
        <Button variant="primary" loading disabled>
          Add
        </Button>
      </>
    );
  } else if (!available.length) {
    body = (
      <p className={styles.notice}>
        {allGroups.length === 0
          ? "Your organization has no groups yet. Create one at the organization level to add it to this project."
          : "Every group in your organization is already added. To add another group, create one at the organization level first."}
      </p>
    );
    footer = (
      <Button
        variant="outline"
        onClick={() => {
          onClose();
          go(accessLinks.org(orgId, OrgAccessControlTabSections.Groups));
        }}
      >
        Go to organization groups
        <Icon icon={ArrowRightIcon} />
      </Button>
    );
  } else {
    const groupError = submitted && !groupId ? REQUIRED : undefined;
    const roleError = submitted && !role ? REQUIRED : undefined;
    body = (
      <form
        id={FORM_ID}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Stack gap={16}>
          <Field label="Group" error={groupError}>
            <Combobox
              label="Group"
              placeholder="Select group..."
              emptyText="No groups match your search"
              options={available.map((group) => ({ value: group.id, label: group.name }))}
              value={groupId ?? ""}
              invalid={Boolean(groupError)}
              onChange={setGroupId}
            />
          </Field>
          <Field label="Role" error={roleError}>
            <Combobox
              label="Role"
              placeholder="Select role..."
              emptyText="No roles found"
              options={(roles.data ?? []).map((item) => ({
                value: item.slug,
                label: item.name,
                meta: item.description ?? undefined
              }))}
              value={role ?? ""}
              invalid={Boolean(roleError)}
              onChange={setRole}
            />
          </Field>
        </Stack>
      </form>
    );
    footer = (
      <>
        {cancel}
        <Button variant="primary" type="submit" form={FORM_ID} loading={pending}>
          Add
        </Button>
      </>
    );
  }

  return (
    <DialogContent pending={pending}>
      <DialogHeader>
        <DialogTitle>Add group to project</DialogTitle>
        <DialogDescription>
          Select an organization group and assign its project role.
        </DialogDescription>
      </DialogHeader>
      {body}
      <DialogFooter>{footer}</DialogFooter>
    </DialogContent>
  );
};

export const GroupModal = ({
  projectId,
  open,
  onOpenChange
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <Content key={String(open)} projectId={projectId} onClose={() => onOpenChange(false)} />
  </Dialog>
);

export const RemoveGroupDialog = ({
  projectId,
  group,
  onOpenChange,
  onRemoved
}: {
  projectId: string;
  group?: { id: string; name: string };
  onOpenChange: (open: boolean) => void;
  onRemoved?: () => void;
}) => {
  const removeGroup = useV4Adapter("access").useRemoveProjectGroup();
  return (
    <AlertDialog open={Boolean(group)} onOpenChange={onOpenChange}>
      <AlertDialogContent tone="danger" confirmText={group?.name ?? ""}>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Remove "${group?.name ?? ""}" from project?`}</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the group&apos;s access to this project. You can add the group again later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={async () => {
              if (!group) return;
              onOpenChange(false);
              try {
                await removeGroup.mutateAsync({
                  groupId: group.id,
                  projectId,
                  projectType: PROJECT_TYPE
                });
                saved("Successfully removed group from project");
                onRemoved?.();
              } catch (error) {
                failed("Failed to remove group from project", error);
              }
            }}
          >
            Remove group
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
