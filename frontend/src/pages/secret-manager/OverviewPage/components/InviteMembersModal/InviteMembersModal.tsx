import { useEffect } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InfoIcon, SendHorizontalIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import Telemetry from "@app/components/utilities/telemetry/Telemetry";
import {
  Button,
  CreatableSelect,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useAddUserToWsNonE2EE, useGetOrgUsers } from "@app/hooks/api";
import { ProjectVersion } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

// PostHog event names for the secrets activation nudge, so we can measure the
// shown -> invited/dismissed conversion funnel of this modal.
const ACTIVATION_EVENTS = {
  Viewed: "Secrets Activation Modal Viewed",
  Invited: "Secrets Activation Modal Members Invited",
  Dismissed: "Secrets Activation Modal Dismissed"
} as const;

const inviteMembersFormSchema = z.object({
  members: z
    .array(
      z.object({
        label: z.string().trim(),
        value: z.string().trim()
      })
    )
    .min(1)
});

type TInviteMembersForm = z.infer<typeof inviteMembersFormSchema>;

type Props = {
  popUp: UsePopUpState<["inviteMembers"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["inviteMembers"]>, state?: boolean) => void;
};

export const InviteMembersModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const orgId = currentOrg?.id || "";
  const projectId = currentProject?.id || "";

  const { data: orgUsers } = useGetOrgUsers(orgId);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { isSubmitting, errors }
  } = useForm<TInviteMembersForm>({
    resolver: zodResolver(inviteMembersFormSchema),
    defaultValues: { members: [] }
  });

  const { append } = useFieldArray<TInviteMembersForm>({ control, name: "members" });

  const { mutateAsync: addUserToProject } = useAddUserToWsNonE2EE();

  const telemetry = new Telemetry().getInstance();
  const baseEventProps = { orgId, projectId, projectType: currentProject?.type };

  const isOpen = popUp?.inviteMembers?.isOpen;
  // Fire once each time the nudge surfaces. The modal opens at most once per session
  // (see useSecretsActivationNudge), so guarding on the open state is sufficient.
  useEffect(() => {
    if (isOpen) telemetry.capture(ACTIVATION_EVENTS.Viewed, baseEventProps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const selectedMembers = watch("members");

  const onInvite = async ({ members: selectedPeople }: TInviteMembersForm) => {
    if (!currentProject) return;
    if (!currentOrg?.id) return;

    if (currentProject.version === ProjectVersion.V1) {
      createNotification({
        type: "error",
        text: "Please upgrade your project to invite new members to the project."
      });
      return;
    }

    // Every entry is a brand-new invitee typed in as an email address.
    const usernames = selectedPeople.map((person) => person.value.toLowerCase());
    if (usernames.length) {
      await addUserToProject({
        usernames,
        orgId: currentOrg.id,
        projectId: currentProject.id,
        projectType: currentProject.type,
        roleSlugs: [ProjectMembershipRole.Member]
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
    handlePopUpToggle("inviteMembers", false);
    reset();
  };

  return (
    <Dialog
      open={popUp?.inviteMembers?.isOpen}
      onOpenChange={(open) => {
        handlePopUpToggle("inviteMembers", open);
        if (!open) reset();
      }}
    >
      <DialogContent
        className="overflow-visible sm:max-w-md"
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Invite your team</DialogTitle>
          <DialogDescription>
            Everyone has secrets, even your colleagues. Bring your team in to review, rotate, and
            manage them together.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onInvite)} className="flex flex-col gap-4">
          <Controller
            control={control}
            name="members"
            render={({ field }) => (
              <Field>
                <FieldLabel>
                  People
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="Role information"
                        className="text-muted transition-colors hover:text-foreground"
                      >
                        <InfoIcon className="size-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>New members join with the Member role.</TooltipContent>
                  </Tooltip>
                </FieldLabel>
                <FieldContent>
                  <CreatableSelect
                    /* eslint-disable-next-line react/no-unstable-nested-components */
                    noOptionsMessage={() => (
                      <p>Type an email address to invite someone new to your organization.</p>
                    )}
                    onCreateOption={(inputValue) =>
                      append({ label: inputValue, value: inputValue })
                    }
                    formatCreateLabel={(inputValue) => `Invite "${inputValue}"`}
                    isValidNewOption={(input) =>
                      Boolean(input) &&
                      z.string().email().safeParse(input).success &&
                      !orgUsers?.some(({ user }) => user.email === input || user.username === input)
                    }
                    placeholder="teammate@company.com"
                    isMulti
                    name="members"
                    components={{ DropdownIndicator: null, IndicatorSeparator: null }}
                    value={field.value}
                    onChange={field.onChange}
                    isError={!!errors.members?.length}
                  />
                </FieldContent>
                <FieldError>{errors.members?.[0]?.message}</FieldError>
              </Field>
            )}
          />
          <DialogFooter>
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                telemetry.capture(ACTIVATION_EVENTS.Dismissed, baseEventProps);
                handlePopUpToggle("inviteMembers", false);
                reset();
              }}
            >
              Maybe later
            </Button>
            <Button
              type="submit"
              variant="project"
              isPending={isSubmitting}
              isDisabled={isSubmitting || selectedMembers.length === 0}
            >
              <SendHorizontalIcon />
              Send invites
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
