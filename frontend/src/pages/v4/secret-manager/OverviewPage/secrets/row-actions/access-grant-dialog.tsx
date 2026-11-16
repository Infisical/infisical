import { useRef, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { Stack } from "@infisical/cipher/ui/layout";
import { MultiSelect } from "@infisical/cipher/ui/multi-select";
import { MultiStep } from "@infisical/cipher/ui/multi-step";

import {
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { useOrgId } from "../../../../access/permissions";
import { readableFailure, saved } from "../../../../access/toast";
import { useV4Adapter } from "../../../../data/adapters";
import { useV4Session } from "../../../../data/session/contract";
import type { Secret } from "../../secrets-model";

const ACTION_OPTIONS = [
  { value: ProjectPermissionSecretActions.DescribeSecret, label: "Describe" },
  { value: ProjectPermissionSecretActions.ReadValue, label: "Read Value" },
  { value: ProjectPermissionSecretActions.Create, label: "Create" },
  { value: ProjectPermissionSecretActions.Edit, label: "Edit" },
  { value: ProjectPermissionSecretActions.Delete, label: "Delete" }
];
const DEFAULT_ACTIONS: string[] = [
  ProjectPermissionSecretActions.DescribeSecret,
  ProjectPermissionSecretActions.ReadValue
];
const PARENT = "parent:";

const nameOf = (user: { firstName?: string | null; lastName?: string | null }) =>
  [user.firstName, user.lastName].filter(Boolean).join(" ");

export function GrantAccessDialog({
  secret,
  canAddParentOrgUsers,
  onClose
}: {
  secret: Secret;
  canAddParentOrgUsers: boolean;
  onClose: () => void;
}) {
  const orgId = useOrgId();
  const { organization } = useV4Session();
  const access = useV4Adapter("access");
  const secrets = useV4Adapter("secrets");
  const available = access.useAvailableProjectUsers(secret.project, ProjectType.SecretManager);
  const parentUsers = secrets.useAvailableParentOrgUsers(canAddParentOrgUsers);
  const org = access.useOrganization(orgId);
  const addUsers = access.useAddProjectUsers();
  const inviteUsers = access.useInviteOrgUsers();
  const createPrivilege = secrets.useCreateUserPrivilege();
  const [users, setUsers] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>(DEFAULT_ACTIONS);
  const submitting = useRef(false);
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: users.length > 0,
    onDiscard: onClose
  });

  const options = [
    ...(available.data ?? []).map((user) => ({
      value: user.username,
      label: nameOf(user) || user.email || user.username,
      meta: user.username,
      group: organization.isSubOrganization ? "Sub-organization users" : "Organization users"
    })),
    ...(canAddParentOrgUsers ? (parentUsers.data ?? []) : []).map((user) => ({
      value: `${PARENT}${user.username}`,
      label: nameOf(user) || user.username,
      meta: user.username,
      group: "Organization users"
    }))
  ];
  const parentPicked = users.filter((value) => value.startsWith(PARENT));

  const submit = async () => {
    submitting.current = true;
    try {
      if (parentPicked.length) {
        const picked = new Set(parentPicked);
        const emails = (parentUsers.data ?? [])
          .filter((user) => picked.has(`${PARENT}${user.username}`))
          .map((user) => user.email ?? user.username);
        await inviteUsers
          .mutateAsync({
            organizationId: orgId,
            inviteeEmails: emails,
            organizationRoleSlug: org.data?.defaultMembershipRole ?? "member"
          })
          .catch(readableFailure("Couldn't add the users to this organization."));
      }
      const result = (await addUsers
        .mutateAsync({
          projectId: secret.project,
          orgId,
          projectType: ProjectType.SecretManager,
          usernames: users.map((value) => value.replace(PARENT, "")),
          roleSlugs: ["no-access"]
        })
        .catch(readableFailure("Couldn't add the users to this project."))) as {
        memberships?: { id: string }[];
      };
      await Promise.all(
        (result.memberships ?? []).map((membership) =>
          createPrivilege.mutateAsync({
            projectMembershipId: membership.id,
            type: { isTemporary: false },
            permissions: [
              {
                action: actions,
                subject: ProjectPermissionSub.Secrets,
                conditions: {
                  environment: secret.environment,
                  secretPath: secret.path,
                  secretName: { $eq: secret.name }
                }
              }
            ]
          })
        )
      ).catch(readableFailure("Couldn't grant access to this secret."));
      saved(
        `Granted ${users.length} ${users.length === 1 ? "user" : "users"} access to this secret`
      );
      onClose();
    } finally {
      submitting.current = false;
    }
  };

  let disabledReason: string | undefined;
  if (!users.length) disabledReason = "Select users to grant access";
  else if (!actions.length) disabledReason = "Select at least one permission";

  return (
    <>
      <MultiStep
        variant="dialog"
        title="Grant organization user access"
        open
        onOpenChange={(next) => {
          if (next || submitting.current) return;
          requestDiscard();
        }}
        completeLabel={users.length > 1 ? `Grant ${users.length} users access` : "Grant access"}
        onComplete={submit}
        steps={[
          {
            title: "Access",
            disabledReason,
            content: (
              <Stack gap={16}>
                <Field label="Users">
                  <Combobox
                    multiple
                    label="Users"
                    placeholder="Search users..."
                    emptyText={available.isPending ? "Loading" : "No users available to add."}
                    options={options}
                    value={users}
                    onChange={setUsers}
                  />
                </Field>
                <Field
                  label="Grant access"
                  description={
                    parentPicked.length
                      ? `${parentPicked.length} ${parentPicked.length === 1 ? "user" : "users"} will be added to this sub-organization first.`
                      : undefined
                  }
                >
                  <MultiSelect
                    label="Grant access"
                    placeholder="Select permissions..."
                    options={ACTION_OPTIONS}
                    value={actions}
                    onChange={setActions}
                  />
                </Field>
              </Stack>
            )
          }
        ]}
      />
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        description="Your user selection will be lost."
      />
    </>
  );
}
