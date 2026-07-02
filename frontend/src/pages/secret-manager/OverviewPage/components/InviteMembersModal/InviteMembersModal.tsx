import { useMemo } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InfoIcon, SendHorizontalIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
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
import { useAddUserToWsNonE2EE, useGetOrgUsers, useGetWorkspaceUsers } from "@app/hooks/api";
import { ProjectVersion } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

const inviteMembersFormSchema = z.object({
  members: z
    .array(
      z.object({
        label: z.string().trim(),
        value: z.string().trim(),
        isNewInvitee: z.boolean().optional()
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

  const { data: members } = useGetWorkspaceUsers(projectId);
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

  // Org members that are not already part of this project, shown as suggestions.
  const suggestionList = useMemo(() => {
    const wsUserUsernames = new Set(members?.map((member) => member.user.username));
    return (orgUsers || [])
      .filter(({ user: u }) => !wsUserUsernames.has(u.username))
      .map(({ id, inviteEmail, user: { firstName, lastName, email } }) => ({
        value: id,
        label:
          firstName && lastName
            ? `${firstName} ${lastName}`
            : firstName || lastName || email || inviteEmail
      }));
  }, [orgUsers, members]);

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

    // Suggested org members carry their membership id in `value`; resolve those back to an
    // email/username. Typed-in invitees carry their email directly in `value`.
    const existingOrgUsers = selectedPeople
      .filter((person) => !person.isNewInvitee)
      .map((person) => orgUsers?.find((orgUser) => orgUser.id === person.value));

    const newInviteeEmails = selectedPeople
      .filter((person) => person.isNewInvitee)
      .map((person) => person.value);

    const existingUserEmails = existingOrgUsers
      .map((member) => member?.user.username || member?.user.email || null)
      .filter(Boolean) as string[];

    if (existingUserEmails.length !== existingOrgUsers.length) {
      createNotification({
        type: "error",
        text: "Failed to send invites. One or more selected users were invalid."
      });
      return;
    }

    const usernames = [...existingUserEmails, ...newInviteeEmails];
    if (usernames.length) {
      await addUserToProject({
        usernames,
        orgId: currentOrg.id,
        projectId: currentProject.id,
        projectType: currentProject.type,
        roleSlugs: [ProjectMembershipRole.Member]
      });
    }

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
      onOpenChange={(isOpen) => {
        handlePopUpToggle("inviteMembers", isOpen);
        if (!isOpen) reset();
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
                      append({ label: inputValue, value: inputValue, isNewInvitee: true })
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
                    options={suggestionList}
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
