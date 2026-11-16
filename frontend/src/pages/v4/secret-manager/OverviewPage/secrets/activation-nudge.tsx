import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { Field } from "@infisical/cipher/ui/field";
import { Stack } from "@infisical/cipher/ui/layout";
import { MultiStep } from "@infisical/cipher/ui/multi-step";
import { Select } from "@infisical/cipher/ui/select";
import { TagsInput } from "@infisical/cipher/ui/tags-input";
import { CircleCheckIcon, SendHorizontalIcon, XIcon } from "lucide-react";

import {
  OrgPermissionMemberActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { isValidEmail, MAX_INVITE_EMAILS, normalizeEmail } from "@app/helpers/email";
import { ProjectType, ProjectVersion } from "@app/hooks/api/projects/types";
import { analytics, AnalyticsEvent } from "@app/lib/analytics";
import type { SecretsActivationProperties } from "@app/lib/analytics/events";

import { useOrgPermission } from "../../../access/permissions";
import { useMemberRoleAccess } from "../../../access/project/member-access";
import { failed, readableFailure, toast } from "../../../access/toast";
import { useV4Adapter, useV4Mode } from "../../../data/adapters";
import type { ActivationVariant } from "../../../data/secrets/contract-activation";
import { useV4Session } from "../../../data/session/contract";

import styles from "./activation-nudge.module.css";

const NUDGE_DELAY_MS = 1500;
const SUCCESS_AUTO_DISMISS_MS = 3000;
const SENT = { title: "Invites sent", description: "Your teammates will get an email to join." };

export const useSecretsActivationNudge = () => {
  const session = useV4Session();
  const { permission } = useOrgPermission();
  const check = useV4Adapter("secrets").useSecretsActivationCheck();
  const [open, setOpen] = useState(false);
  const openTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(openTimeout.current), []);
  const canInvite = permission.can(OrgPermissionMemberActions.Create, OrgPermissionSubjects.Member);
  const orgId = session.organization.id;
  const isRoot = !session.organization.isSubOrganization;
  const userId = session.user.id;

  const checkActivation = useCallback(() => {
    if (!isRoot || !canInvite) return;
    check(orgId, userId).then(
      (shouldShow) => {
        if (!shouldShow) return;
        clearTimeout(openTimeout.current);
        openTimeout.current = setTimeout(() => setOpen(true), NUDGE_DELAY_MS);
      },
      () => undefined
    );
  }, [isRoot, canInvite, check, orgId, userId]);

  return { open, setOpen, checkActivation };
};

const validateEmail = (tag: string, tags: readonly string[]) => {
  if (!isValidEmail(normalizeEmail(tag))) return "Enter a valid email address";
  if (tags.length >= MAX_INVITE_EMAILS)
    return `You can invite up to ${MAX_INVITE_EMAILS} people at once`;
  return undefined;
};

const useInvite = (
  projectId: string,
  presentation: "modal" | "card",
  variant: ActivationVariant
) => {
  const { organization } = useV4Session();
  const mode = useV4Mode();
  const access = useV4Adapter("access");
  const project = access.useProject(projectId);
  const addUsers = access.useAddProjectUsers();
  const capture = (
    event:
      | typeof AnalyticsEvent.SecretsActivationModalViewed
      | typeof AnalyticsEvent.SecretsActivationModalDismissed
      | typeof AnalyticsEvent.SecretsActivationModalMembersInvited,
    extra?: { invitedCount: number }
  ) => {
    if (mode === "demo") return;
    const properties: SecretsActivationProperties = {
      projectId,
      projectType: ProjectType.SecretManager,
      presentation,
      experiment_variant: variant,
      "$feature/secrets-activation-presentation": variant
    };
    if (event === AnalyticsEvent.SecretsActivationModalMembersInvited)
      analytics.captureForOrganization(event, organization.id, {
        ...properties,
        invitedCount: extra?.invitedCount ?? 0
      });
    else analytics.captureForOrganization(event, organization.id, properties);
  };
  const send = async (emails: string[], roleSlug: string) => {
    if (project.data?.version === ProjectVersion.V1) {
      failed("Please upgrade your project to invite new members to the project.");
      return false;
    }
    await addUsers
      .mutateAsync({
        usernames: emails,
        orgId: organization.id,
        projectId,
        projectType: ProjectType.SecretManager,
        roleSlugs: [roleSlug]
      })
      .catch(readableFailure("Couldn't send invites"));
    capture(AnalyticsEvent.SecretsActivationModalMembersInvited, { invitedCount: emails.length });
    return true;
  };
  return { capture, send };
};

const useDefaultRole = (projectId: string) => {
  const { assignable, rolesPending } = useMemberRoleAccess(projectId);
  const role = useMemo(
    () => assignable.find((entry) => entry.slug === "member") ?? assignable[0],
    [assignable]
  );
  return { assignable, role, rolesPending };
};

function InviteMembersDialog({
  projectId,
  variant,
  open,
  onOpenChange
}: {
  projectId: string;
  variant: ActivationVariant;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { capture, send } = useInvite(projectId, "modal", variant);
  const { assignable, role } = useDefaultRole(projectId);
  const [emails, setEmails] = useState<string[]>([]);
  const [roleSlug, setRoleSlug] = useState<string>();
  const viewed = useRef(false);

  useEffect(() => {
    if (!open || viewed.current) return;
    viewed.current = true;
    capture(AnalyticsEvent.SecretsActivationModalViewed);
  });

  const close = () => {
    setEmails([]);
    setRoleSlug(undefined);
    onOpenChange(false);
  };

  return (
    <MultiStep
      variant="dialog"
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title="Invite your team"
      description="Teammates get an email to join this project."
      completeLabel="Send invites"
      onCancel={() => capture(AnalyticsEvent.SecretsActivationModalDismissed)}
      steps={[
        {
          title: "Invite",
          completeIcon: "user-plus",
          validate: () =>
            emails.length ? true : { fields: { emails: "Enter at least one email address" } },
          content: (
            <Stack gap={16}>
              <Field label="Emails" name="emails">
                <TagsInput
                  label="Emails"
                  placeholder="email@example.com, email2@example.com..."
                  value={emails}
                  onChange={setEmails}
                  validate={validateEmail}
                />
              </Field>
              <Field
                label="Project role"
                name="role"
                help="Select which role to assign to the invited members in this project."
              >
                <Select
                  aria-label="Project role"
                  placeholder="Select role..."
                  options={assignable.map((entry) => ({
                    value: entry.slug,
                    label: entry.name,
                    description: entry.description ?? undefined
                  }))}
                  value={roleSlug ?? role?.slug}
                  onValueChange={setRoleSlug}
                />
              </Field>
            </Stack>
          )
        }
      ]}
      onComplete={async () => {
        const slug = roleSlug ?? role?.slug;
        if (!slug) return { fields: { role: "Select a role" } };
        if (!(await send(emails, slug))) return false;
        toast({ tone: "ok", ...SENT });
        close();
        return true;
      }}
    />
  );
}

function InviteMembersCard({
  projectId,
  open,
  lifted,
  onOpenChange
}: {
  projectId: string;
  open: boolean;
  lifted: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { capture, send } = useInvite(projectId, "card", "card");
  const { role, rolesPending } = useDefaultRole(projectId);
  const [emails, setEmails] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const dismissTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const viewed = useRef(false);

  useEffect(() => () => clearTimeout(dismissTimeout.current), []);
  useEffect(() => {
    if (!open || viewed.current) return;
    viewed.current = true;
    capture(AnalyticsEvent.SecretsActivationModalViewed);
  });

  if (!open) return null;

  const close = () => {
    clearTimeout(dismissTimeout.current);
    setEmails([]);
    setError(undefined);
    setSuccess(false);
    onOpenChange(false);
  };
  const dismiss = () => {
    if (pending) return;
    capture(AnalyticsEvent.SecretsActivationModalDismissed);
    close();
  };
  const submit = async () => {
    if (!role) return;
    if (!emails.length) {
      setError("Enter at least one email address");
      return;
    }
    setPending(true);
    try {
      if (!(await send(emails, role.slug))) return;
      setSuccess(true);
      dismissTimeout.current = setTimeout(close, SUCCESS_AUTO_DISMISS_MS);
    } catch (sendError) {
      failed("Couldn't send invites", sendError);
    } finally {
      setPending(false);
    }
  };

  let roleDescription: string | undefined;
  if (rolesPending) roleDescription = "Loading project roles...";
  else if (role) roleDescription = `Invited teammates join this project as ${role.name}.`;
  else
    roleDescription = "You can't assign a project role here, so send invites from Access control.";

  return (
    <div
      role="region"
      aria-label="Invite your team"
      className={styles.nudge}
      data-lifted={lifted || undefined}
    >
      <Card
        title={success ? SENT.title : "Invite your team"}
        action={
          <Button
            variant="ghost"
            size="icon-xs"
            icon={XIcon}
            iconOnly
            aria-label="Dismiss"
            disabled={pending}
            onClick={success ? close : dismiss}
          />
        }
        footer={
          success ? undefined : (
            <div className={styles.actions}>
              <Button variant="ghost" size="sm" disabled={pending} onClick={dismiss}>
                Not now
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={SendHorizontalIcon}
                loading={pending}
                disabled={!role}
                onClick={submit}
              >
                Send invites
              </Button>
            </div>
          )
        }
      >
        {success ? (
          <p className={styles.success}>
            <CircleCheckIcon size={16} />
            {SENT.description}
          </p>
        ) : (
          <Field label="Emails" description={roleDescription} error={error}>
            <TagsInput
              label="Emails"
              placeholder="email@example.com, email2@example.com"
              value={emails}
              disabled={!role}
              invalid={Boolean(error)}
              onChange={(next) => {
                setEmails(next);
                setError(undefined);
              }}
              validate={validateEmail}
            />
          </Field>
        )}
      </Card>
    </div>
  );
}

export function SecretsActivationNudge({
  projectId,
  open,
  lifted,
  onOpenChange
}: {
  projectId: string;
  open: boolean;
  lifted: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: variant, isPending } = useV4Adapter("secrets").useActivationVariant(open);
  if (isPending || variant === undefined) return null;
  if (variant === "card")
    return (
      <InviteMembersCard
        projectId={projectId}
        open={open}
        lifted={lifted}
        onOpenChange={onOpenChange}
      />
    );
  return (
    <InviteMembersDialog
      projectId={projectId}
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}
