import { useRef, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { MultiStep } from "@infisical/cipher/ui/multi-step";

import {
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { IdentityProjectAdditionalPrivilegeTemporaryMode } from "@app/hooks/api/identityProjectAdditionalPrivilege/types";
import { ProjectUserAdditionalPrivilegeTemporaryMode } from "@app/hooks/api/projectUserAdditionalPrivilege/types";

import {
  DurationPicker,
  type GrantDraft,
  permanent
} from "../../../../access/project/temporary-access";
import {
  type PermissionErrors,
  projectToApi,
  type RolePermissions,
  ruleId,
  subjectsFor,
  validatePermissions
} from "../../../../access/roles/permissions-model";
import { RuleTable } from "../../../../access/roles/rule-table";
import { readableFailure, saved } from "../../../../access/toast";
import { useV4Adapter } from "../../../../data/adapters";
import type { Secret } from "../../secrets-model";

export type PrivilegeTarget = {
  type: "user" | "identity";
  membershipId: string;
  identityId: string;
  name: string;
};

const SUBJECTS = subjectsFor("project");

export function AdditionalPrivilegeSheet({
  secret,
  target,
  onClose
}: {
  secret: Secret;
  target: PrivilegeTarget;
  onClose: () => void;
}) {
  const secrets = useV4Adapter("secrets");
  const project = secrets.useProject(secret.project);
  const createUser = secrets.useCreateUserPrivilege();
  const createIdentity = secrets.useCreateIdentityPrivilege();
  const [slug, setSlug] = useState("");
  const [duration, setDuration] = useState<GrantDraft>(() => permanent(""));
  const [draft, setDraft] = useState<RolePermissions>(() => ({
    [ProjectPermissionSub.Secrets]: [
      {
        id: ruleId(),
        actions: [
          ProjectPermissionSecretActions.DescribeSecret,
          ProjectPermissionSecretActions.ReadValue
        ],
        inverted: false,
        conditions: [
          { lhs: "environment", operator: "$eq", rhs: secret.environment },
          { lhs: "secretPath", operator: "$eq", rhs: secret.path },
          { lhs: "secretName", operator: "$eq", rhs: secret.name }
        ]
      }
    ]
  }));
  const [errors, setErrors] = useState<PermissionErrors>();
  const [dirty, setDirty] = useState(false);
  const submitting = useRef(false);
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: dirty,
    onDiscard: onClose
  });

  const changeRules = (next: RolePermissions) => {
    setDraft(next);
    setDirty(true);
    if (errors) setErrors(validatePermissions("project", next));
  };

  const validate = () => {
    if (!Object.values(draft).some((rules) => rules.length))
      return { message: "Add at least one rule." };
    const found = validatePermissions("project", draft);
    if (Object.keys(found).length) {
      setErrors(found);
      return { message: "Fix the rules marked Needs attention." };
    }
    setErrors(undefined);
    return true;
  };

  const submit = async () => {
    submitting.current = true;
    const permissions = projectToApi(draft);
    const temporary = duration.isTemporary && duration.temporaryRange;
    try {
      if (target.type === "user")
        await createUser
          .mutateAsync({
            projectMembershipId: target.membershipId,
            slug: slug.trim() || undefined,
            permissions,
            type: temporary
              ? {
                  isTemporary: true,
                  temporaryMode: ProjectUserAdditionalPrivilegeTemporaryMode.Relative,
                  temporaryRange: duration.temporaryRange,
                  temporaryAccessStartTime: duration.temporaryAccessStartTime
                }
              : { isTemporary: false }
          })
          .catch(readableFailure("Couldn't create the privilege."));
      else
        await createIdentity
          .mutateAsync({
            identityId: target.identityId,
            projectId: secret.project,
            slug: slug.trim() || undefined,
            permissions,
            type: temporary
              ? {
                  isTemporary: true,
                  temporaryMode: IdentityProjectAdditionalPrivilegeTemporaryMode.Relative,
                  temporaryRange: duration.temporaryRange,
                  temporaryAccessStartTime: duration.temporaryAccessStartTime
                }
              : { isTemporary: false }
          })
          .catch(readableFailure("Couldn't create the privilege."));
      saved("Successfully created privilege");
      onClose();
    } finally {
      submitting.current = false;
    }
  };

  return (
    <>
      <MultiStep
        variant="sheet"
        size="lg"
        title={`Add additional privilege for ${target.name}`}
        description={`Grant ${target.name} access to the secret ${secret.name}`}
        open
        onOpenChange={(next) => {
          if (next || submitting.current) return;
          requestDiscard();
        }}
        completeLabel="Create privilege"
        onComplete={submit}
        steps={[
          {
            title: "Privilege",
            validate,
            content: (
              <Stack gap={16}>
                <Inline gap={16} align="end">
                  <Field label="Privilege name" optional name="slug">
                    <Input
                      value={slug}
                      onChange={(event) => {
                        setSlug(event.target.value);
                        setDirty(true);
                      }}
                    />
                  </Field>
                  <Field label="Duration">
                    <DurationPicker
                      grant={duration}
                      label="Duration"
                      onChange={(next) => {
                        setDuration(next);
                        setDirty(true);
                      }}
                    />
                  </Field>
                </Inline>
                <RuleTable
                  scope="project"
                  draft={draft}
                  subjects={SUBJECTS}
                  editable
                  reason=""
                  errors={errors}
                  onChange={changeRules}
                  references={{
                    environments: project.data?.environments.map((environment) => environment.slug)
                  }}
                />
              </Stack>
            )
          }
        ]}
      />
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        description="Your privilege and its rules will be lost."
      />
    </>
  );
}
