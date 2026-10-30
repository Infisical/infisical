import { type ReactNode, useState } from "react";
import { ArrowRightIcon } from "lucide-react";

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

import { useAccess } from "../context";

import styles from "./group.module.css";

const REQUIRED = "Required";
const FORM_ID = "add-project-group";

const Content = ({ onClose }: { onClose: () => void }) => {
  const { data, update, saved, loading, navigate } = useAccess();
  const [groupId, setGroupId] = useState<string>();
  const [role, setRole] = useState<string>();
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);

  const assigned = new Set(data.projectGroups.map((group) => group.groupId));
  const available = data.orgGroups.filter((group) => !assigned.has(group.id));

  const submit = () => {
    setSubmitted(true);
    if (!groupId || !role) return;
    setPending(true);
    window.setTimeout(() => {
      update((current) => ({
        ...current,
        projectGroups: [
          ...current.projectGroups,
          {
            groupId,
            roles: [{ id: `${groupId}-${role}`, role, isTemporary: false }],
            createdAt: "Oct 30, 2026"
          }
        ]
      }));
      setPending(false);
      saved("Successfully added group to project");
      onClose();
    }, 500);
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
        {data.orgGroups.length === 0
          ? "Your organization has no groups yet. Create one at the organization level to add it to this project."
          : "Every group in your organization is already added. To add another group, create one at the organization level first."}
      </p>
    );
    footer = (
      <Button
        variant="outline"
        onClick={() => {
          onClose();
          navigate({ scope: "org", orgTab: "groups" });
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
              options={data.projectRoles.map((item) => ({
                value: item.slug,
                label: item.name,
                meta: item.description
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
    <DialogContent>
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
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <Content key={String(open)} onClose={() => onOpenChange(false)} />
  </Dialog>
);
