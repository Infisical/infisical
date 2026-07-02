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
import { useGetOrgUsers, useGetWorkspaceUsers } from "@app/hooks/api";
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

const getInitials = (user: {
  firstName?: string;
  lastName?: string;
  email?: string;
  username?: string;
}) => {
  const first = user.firstName?.trim();
  const last = user.lastName?.trim();
  if (first || last) {
    return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
  }
  return (user.email || user.username || "?").charAt(0).toUpperCase();
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

  // Org members that are not already part of this project, shown as suggestions.
  const suggestionList = useMemo(() => {
    const wsUserUsernames = new Map();
    members?.forEach((member) => {
      wsUserUsernames.set(member.user.username, true);
    });
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

  const teammates = useMemo(() => (members ?? []).slice(0, 3), [members]);
  const teammateCount = members?.length ?? 0;

  const selectedMembers = watch("members");

  const onInvite = () => {
    // Submit is intentionally UI only for now. The triggering action and the real
    // invite request are wired later (see the modal plan for how to reuse
    // useAddUserToWsNonE2EE with the default Member role).
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
      <DialogContent className="overflow-visible sm:max-w-md">
        <DialogHeader>
          {teammateCount > 0 && (
            <div className="flex items-center gap-3">
              <div className="flex">
                {teammates.map((member, idx) => (
                  <span
                    key={member.id}
                    className={`flex size-7 items-center justify-center rounded-full border-2 border-popover bg-project/15 text-[11px] font-semibold text-project ${
                      idx > 0 ? "-ml-2" : ""
                    }`}
                  >
                    {getInitials(member.user)}
                  </span>
                ))}
              </div>
              <span className="text-xs text-muted">
                {teammateCount} {teammateCount === 1 ? "teammate" : "teammates"} already on this
                project
              </span>
            </div>
          )}
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
                      !orgUsers
                        ?.flatMap(({ user }) => {
                          const emails: string[] = [];

                          if (user.email) {
                            emails.push(user.email);
                          }

                          if (user.username) {
                            emails.push(user.username);
                          }

                          return emails;
                        })
                        .includes(input)
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
              onClick={() => handlePopUpToggle("inviteMembers", false)}
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
