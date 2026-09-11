import { useEffect, useMemo, useRef, useState } from "react";
import { Control, Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheckIcon, SendHorizontalIcon, XIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import Telemetry from "@app/components/utilities/telemetry/Telemetry";
import {
  Button,
  Card,
  CardDescription,
  CardTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  IconButton,
  Input
} from "@app/components/v3";
import { useOrganization, useProject, useProjectPermission } from "@app/context";
import { emailListSchema, parseEmailList } from "@app/helpers/email";
import { useAddUserToWsNonE2EE, useGetProjectRoles } from "@app/hooks/api";
import { ProjectVersion } from "@app/hooks/api/projects/types";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { filterByGrantConditions, getMemberAssignRoleConditions } from "@app/lib/fn/permission";

import { FLOATING_BAR_DEFAULT_BOTTOM_PX, useFloatingBarClearance } from "./useFloatingBarClearance";

// PostHog event names for the secrets activation nudge. They are intentionally the same names the
// blocking modal fired so the shown -> invited/dismissed funnel stays on one timeline; the
// `presentation` property tells the two surfaces apart when comparing conversion.
const ACTIVATION_EVENTS = {
  Viewed: "Secrets Activation Modal Viewed",
  Invited: "Secrets Activation Modal Members Invited",
  Dismissed: "Secrets Activation Modal Dismissed"
} as const;

const PRESENTATION = "card";

// The card has no role picker to stay compact. Invitees get this role when the caller may assign
// it (the modal's default), otherwise the first role the caller's project permissions allow.
const PREFERRED_PROJECT_ROLE_SLUG = "member";

// How long the inline success state stays visible before the card dismisses itself.
const SUCCESS_AUTO_DISMISS_MS = 3000;

export const inviteMembersNudgeFormSchema = z.object({
  emails: emailListSchema
});

// Presentational half: everything visible, no data access. Kept separate so it can be rendered
// without router, query, or org/project context.
export const InviteMembersNudgeCard = ({
  isOpen,
  bottomOffset = FLOATING_BAR_DEFAULT_BOTTOM_PX,
  isSuccess,
  isSubmitting,
  canSubmit,
  roleName,
  control,
  onSubmit,
  onDismiss,
  onClose
}: CardProps) => {
  const prefersReducedMotion = useReducedMotion();

  const transition = { duration: prefersReducedMotion ? 0 : 0.2, ease: "easeInOut" as const };
  const hidden = prefersReducedMotion
    ? { opacity: 0, bottom: bottomOffset }
    : { opacity: 0, y: 12, bottom: bottomOffset };
  const shown = { opacity: 1, y: 0, bottom: bottomOffset };

  let roleDescription: string | undefined;
  if (roleName) {
    roleDescription = `Invited teammates join this project as ${roleName}.`;
  } else if (!canSubmit) {
    roleDescription =
      "You cannot assign a project role here, so invites must be sent from Access Control.";
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="invite-members-nudge"
          role="region"
          aria-label="Invite your team"
          data-slot="invite-members-nudge"
          data-state={isSuccess ? "success" : "idle"}
          className="fixed right-4 left-4 z-40 md:left-auto md:w-[24rem]"
          initial={hidden}
          animate={shown}
          exit={hidden}
          transition={transition}
          onKeyDown={(e) => {
            if (e.key !== "Escape" || isSubmitting) return;
            e.stopPropagation();
            if (isSuccess) onClose();
            else onDismiss();
          }}
        >
          <Card>
            <div data-slot="invite-members-nudge-header" className="flex items-start gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <CardTitle>{isSuccess ? "Invites Sent" : "Invite Your Team"}</CardTitle>
                <CardDescription>
                  {isSuccess
                    ? "Your teammates will get an email to join this project."
                    : "Bring teammates in to review, rotate, and manage secrets together."}
                </CardDescription>
              </div>
              <IconButton
                type="button"
                variant="ghost-muted"
                size="xs"
                aria-label="Dismiss"
                isDisabled={isSubmitting}
                onClick={isSuccess ? onClose : onDismiss}
              >
                <XIcon />
              </IconButton>
            </div>
            {isSuccess ? (
              <div
                data-slot="invite-members-nudge-success"
                className="flex items-center gap-2 text-sm text-success"
              >
                <CircleCheckIcon className="size-4 shrink-0" />
                Invites are on their way.
              </div>
            ) : (
              <form
                data-slot="invite-members-nudge-form"
                onSubmit={onSubmit}
                className="flex flex-col gap-3"
              >
                <Controller
                  control={control}
                  name="emails"
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="invite-members-nudge-emails">Emails</FieldLabel>
                      <Input
                        id="invite-members-nudge-emails"
                        type="text"
                        autoComplete="off"
                        isError={Boolean(error)}
                        disabled={!canSubmit}
                        placeholder="email@example.com, email2@example.com"
                        {...field}
                      />
                      <FieldDescription>{roleDescription}</FieldDescription>
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <div
                  data-slot="invite-members-nudge-actions"
                  className="flex items-center justify-end gap-2"
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    isDisabled={isSubmitting}
                    onClick={onDismiss}
                  >
                    Not Now
                  </Button>
                  <Button
                    type="submit"
                    variant="project"
                    size="sm"
                    isPending={isSubmitting}
                    isDisabled={isSubmitting || !canSubmit}
                  >
                    <SendHorizontalIcon />
                    Send Invites
                  </Button>
                </div>
              </form>
            )}
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Non-modal replacement for the secrets activation invite modal: same trigger schedule and
// dismissal semantics (see useSecretsActivationNudge), but rendered as a dismissible card in the
// bottom-right corner so the user can invite teammates without leaving what they were doing.
export const InviteMembersNudge = ({
  popUp,
  handlePopUpToggle,
  isLifted = false,
  experimentVariant
}: Props) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { permission: projectPermission } = useProjectPermission();

  const orgId = currentOrg?.id || "";
  const projectId = currentProject?.id || "";

  const [isSuccess, setIsSuccess] = useState(false);
  const autoDismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isMountedRef = useRef(true);
  const hasViewedRef = useRef(false);

  const isOpen = Boolean(popUp?.inviteMembers?.isOpen);
  const bottomOffset = useFloatingBarClearance(isOpen && isLifted);

  // Same role source as the access control invite flow: project roles narrowed to the ones the
  // caller's project permissions allow assigning, so the backend's assignable-role check passes.
  const { data: roles, isPending: isRolesPending } = useGetProjectRoles(
    isOpen ? projectId : "",
    currentProject?.type
  );

  const defaultRole = useMemo(() => {
    const assignRoleConditions = getMemberAssignRoleConditions(projectPermission);
    const assignableRoles = filterByGrantConditions(roles ?? [], {
      getKey: (role) => role.slug,
      allowed: assignRoleConditions?.roles,
      forbidden: assignRoleConditions?.forbiddenRoles
    });
    return (
      assignableRoles.find((role) => role.slug === PREFERRED_PROJECT_ROLE_SLUG) ??
      assignableRoles[0]
    );
  }, [roles, projectPermission]);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<TInviteMembersNudgeForm>({
    resolver: zodResolver(inviteMembersNudgeFormSchema),
    defaultValues: { emails: "" }
  });

  const { mutateAsync: addUserToProject } = useAddUserToWsNonE2EE();

  const telemetry = new Telemetry().getInstance();
  const baseEventProps = {
    orgId,
    projectId,
    projectType: currentProject?.type,
    presentation: PRESENTATION,
    experiment_variant: experimentVariant,
    "$feature/secrets-activation-presentation": experimentVariant
  };

  // Fire once each time the nudge surfaces. It opens at most once per session (see
  // useSecretsActivationNudge), so guarding on the open state is sufficient.
  useEffect(() => {
    if (isOpen && !hasViewedRef.current) {
      hasViewedRef.current = true;
      telemetry.capture(ACTIVATION_EVENTS.Viewed, baseEventProps);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (autoDismissTimeoutRef.current) clearTimeout(autoDismissTimeoutRef.current);
    };
  }, []);

  const close = () => {
    if (autoDismissTimeoutRef.current) clearTimeout(autoDismissTimeoutRef.current);
    handlePopUpToggle("inviteMembers", false);
    if (!isMountedRef.current) return;
    reset();
    setIsSuccess(false);
  };

  const onDismiss = () => {
    // A dismissal cannot race an in-flight invite: the controls are disabled while submitting and
    // this guard covers anything that still reaches here, so Dismissed never follows Invited.
    if (isSubmitting) return;
    telemetry.capture(ACTIVATION_EVENTS.Dismissed, baseEventProps);
    close();
  };

  const onInvite = async ({ emails }: TInviteMembersNudgeForm) => {
    if (!currentProject) return;
    if (!currentOrg?.id) return;
    if (!defaultRole) return;

    if (currentProject.version === ProjectVersion.V1) {
      createNotification({
        type: "error",
        text: "Please upgrade your project to invite new members to the project."
      });
      return;
    }

    // emails is already trimmed + lowercased by the schema; parseEmailList splits the entries.
    const usernames = parseEmailList(emails);
    if (usernames.length) {
      await addUserToProject({
        usernames,
        orgId: currentOrg.id,
        projectId: currentProject.id,
        projectType: currentProject.type,
        roleSlugs: [defaultRole.slug]
      });
    }

    telemetry.capture(ACTIVATION_EVENTS.Invited, {
      ...baseEventProps,
      invitedCount: usernames.length
    });

    createNotification({
      type: "success",
      text: "Invites sent. Your teammates will get an email to join."
    });

    if (!isMountedRef.current) return;
    setIsSuccess(true);
    autoDismissTimeoutRef.current = setTimeout(close, SUCCESS_AUTO_DISMISS_MS);
  };

  return (
    <InviteMembersNudgeCard
      isOpen={isOpen}
      bottomOffset={bottomOffset}
      isSuccess={isSuccess}
      isSubmitting={isSubmitting}
      canSubmit={isRolesPending || Boolean(defaultRole)}
      roleName={defaultRole?.name}
      control={control}
      onSubmit={handleSubmit(onInvite)}
      onDismiss={onDismiss}
      onClose={close}
    />
  );
};

export type TInviteMembersNudgeForm = z.infer<typeof inviteMembersNudgeFormSchema>;

type Props = {
  experimentVariant: "card";
  popUp: UsePopUpState<["inviteMembers"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["inviteMembers"]>, state?: boolean) => void;
  // True while a floating bar (selection actions or batch commit) shares the bottom edge of the
  // viewport; the card then measures that bar and sits above it.
  isLifted?: boolean;
};

type CardProps = {
  isOpen: boolean;
  // Distance from the viewport bottom in px; animated so the card slides when a bar appears.
  bottomOffset?: number;
  isSuccess: boolean;
  isSubmitting: boolean;
  // False once roles are known and the caller may not assign any of them.
  canSubmit: boolean;
  // Name of the role invitees will receive, once resolved.
  roleName?: string;
  control: Control<TInviteMembersNudgeForm>;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  // "Not now", X, or Escape before inviting: records the dismissal, then closes.
  onDismiss: () => void;
  // Closes without recording a dismissal (after a successful invite).
  onClose: () => void;
};
