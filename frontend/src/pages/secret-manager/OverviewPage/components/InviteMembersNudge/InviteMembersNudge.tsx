import { useEffect, useRef, useState } from "react";
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
  FieldError,
  FieldLabel,
  IconButton,
  Input
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { emailListSchema, parseEmailList } from "@app/helpers/email";
import { useAddUserToWsNonE2EE } from "@app/hooks/api";
import { ProjectVersion } from "@app/hooks/api/projects/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

// PostHog event names for the secrets activation nudge. They are intentionally the same names the
// blocking modal fired so the shown -> invited/dismissed funnel stays on one timeline; the
// `presentation` property tells the two surfaces apart when comparing conversion.
const ACTIVATION_EVENTS = {
  Viewed: "Secrets Activation Modal Viewed",
  Invited: "Secrets Activation Modal Members Invited",
  Dismissed: "Secrets Activation Modal Dismissed"
} as const;

const PRESENTATION = "card";

// Invited members get the default project role; the card has no role picker to stay compact.
const DEFAULT_PROJECT_ROLE_SLUG = "member";

// How long the inline success state stays visible before the card dismisses itself.
const SUCCESS_AUTO_DISMISS_MS = 3000;

export const inviteMembersNudgeFormSchema = z.object({
  emails: emailListSchema
});

// Presentational half: everything visible, no data access. Kept separate so it can be rendered
// without router, query, or org/project context.
export const InviteMembersNudgeCard = ({
  isOpen,
  isLifted = false,
  isSuccess,
  isSubmitting,
  control,
  onSubmit,
  onDismiss,
  onClose
}: CardProps) => {
  const prefersReducedMotion = useReducedMotion();

  const transition = { duration: prefersReducedMotion ? 0 : 0.2, ease: "easeInOut" as const };
  const hidden = prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="invite-members-nudge"
          role="region"
          aria-label="Invite your team"
          data-slot="invite-members-nudge"
          data-state={isSuccess ? "success" : "idle"}
          className={`fixed right-4 left-4 z-40 md:left-auto md:w-[22rem] ${isLifted ? "bottom-24" : "bottom-4"}`}
          initial={hidden}
          animate={{ opacity: 1, y: 0 }}
          exit={hidden}
          transition={transition}
          onKeyDown={(e) => {
            if (e.key !== "Escape" || isSubmitting) return;
            e.stopPropagation();
            if (isSuccess) onClose();
            else onDismiss();
          }}
        >
          <Card className="gap-4 p-4 shadow-lg">
            <div data-slot="invite-members-nudge-header" className="flex items-start gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <CardTitle className="text-base">
                  {isSuccess ? "Invites Sent" : "Invite Your Team"}
                </CardTitle>
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
                className="-mt-1 -mr-1"
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
                        placeholder="email@example.com, email2@example.com"
                        {...field}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <div
                  data-slot="invite-members-nudge-actions"
                  className="flex items-center justify-end gap-2"
                >
                  <Button variant="ghost" size="sm" type="button" onClick={onDismiss}>
                    Not Now
                  </Button>
                  <Button
                    type="submit"
                    variant="project"
                    size="sm"
                    isPending={isSubmitting}
                    isDisabled={isSubmitting}
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
export const InviteMembersNudge = ({ popUp, handlePopUpToggle, isLifted = false }: Props) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const orgId = currentOrg?.id || "";
  const projectId = currentProject?.id || "";

  const [isSuccess, setIsSuccess] = useState(false);
  const autoDismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
    presentation: PRESENTATION
  };

  const isOpen = Boolean(popUp?.inviteMembers?.isOpen);

  // Fire once each time the nudge surfaces. It opens at most once per session (see
  // useSecretsActivationNudge), so guarding on the open state is sufficient.
  useEffect(() => {
    if (isOpen) telemetry.capture(ACTIVATION_EVENTS.Viewed, baseEventProps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(
    () => () => {
      if (autoDismissTimeoutRef.current) clearTimeout(autoDismissTimeoutRef.current);
    },
    []
  );

  const close = () => {
    if (autoDismissTimeoutRef.current) clearTimeout(autoDismissTimeoutRef.current);
    handlePopUpToggle("inviteMembers", false);
    reset();
    setIsSuccess(false);
  };

  const onDismiss = () => {
    telemetry.capture(ACTIVATION_EVENTS.Dismissed, baseEventProps);
    close();
  };

  const onInvite = async ({ emails }: TInviteMembersNudgeForm) => {
    if (!currentProject) return;
    if (!currentOrg?.id) return;

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
        roleSlugs: [DEFAULT_PROJECT_ROLE_SLUG]
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

    setIsSuccess(true);
    autoDismissTimeoutRef.current = setTimeout(close, SUCCESS_AUTO_DISMISS_MS);
  };

  return (
    <InviteMembersNudgeCard
      isOpen={isOpen}
      isLifted={isLifted}
      isSuccess={isSuccess}
      isSubmitting={isSubmitting}
      control={control}
      onSubmit={handleSubmit(onInvite)}
      onDismiss={onDismiss}
      onClose={close}
    />
  );
};

export type TInviteMembersNudgeForm = z.infer<typeof inviteMembersNudgeFormSchema>;

type Props = {
  popUp: UsePopUpState<["inviteMembers"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["inviteMembers"]>, state?: boolean) => void;
  // Raises the card above the batch-mode commit bar, which shares the bottom edge of the viewport.
  isLifted?: boolean;
};

type CardProps = {
  isOpen: boolean;
  isLifted?: boolean;
  isSuccess: boolean;
  isSubmitting: boolean;
  control: Control<TInviteMembersNudgeForm>;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  // "Not now", X, or Escape before inviting: records the dismissal, then closes.
  onDismiss: () => void;
  // Closes without recording a dismissal (after a successful invite).
  onClose: () => void;
};
