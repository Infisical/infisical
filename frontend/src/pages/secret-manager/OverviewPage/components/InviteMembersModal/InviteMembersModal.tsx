import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InfoIcon, SendHorizontalIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { RoleOption } from "@app/components/roles";
import Telemetry from "@app/components/utilities/telemetry/Telemetry";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldLabel,
  FilterableSelect,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization, useProject, useProjectPermission } from "@app/context";
import { emailListSchema, parseEmailList } from "@app/helpers/email";
import { useAddUserToWsNonE2EE, useGetProjectRoles } from "@app/hooks/api";
import { ProjectVersion } from "@app/hooks/api/projects/types";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { filterByGrantConditions, getMemberAssignRoleConditions } from "@app/lib/fn/permission";

// PostHog event names for the secrets activation nudge, so we can measure the
// shown -> invited/dismissed conversion funnel of this modal.
const ACTIVATION_EVENTS = {
  Viewed: "Secrets Activation Modal Viewed",
  Invited: "Secrets Activation Modal Members Invited",
  Dismissed: "Secrets Activation Modal Dismissed"
} as const;

const DEFAULT_PROJECT_ROLE = { slug: "member", name: "Member" };

const inviteMembersFormSchema = z.object({
  emails: emailListSchema,
  projectRole: z
    .object({
      slug: z.string().min(1),
      name: z.string().min(1)
    })
    .default(DEFAULT_PROJECT_ROLE)
});

type TInviteMembersForm = z.infer<typeof inviteMembersFormSchema>;

type Props = {
  popUp: UsePopUpState<["inviteMembers"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["inviteMembers"]>, state?: boolean) => void;
};

export const InviteMembersModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { permission: projectPermission } = useProjectPermission();

  const orgId = currentOrg?.id || "";
  const projectId = currentProject?.id || "";

  const { data: roles, isPending: isProjectRolesLoading } = useGetProjectRoles(
    projectId,
    currentProject?.type
  );

  const assignRoleConditions = useMemo(
    () => getMemberAssignRoleConditions(projectPermission),
    [projectPermission]
  );

  const filteredRoles = useMemo(
    () =>
      filterByGrantConditions(roles ?? [], {
        getKey: (role) => role.slug,
        allowed: assignRoleConditions?.roles,
        forbidden: assignRoleConditions?.forbiddenRoles
      }),
    [roles, assignRoleConditions]
  );

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<TInviteMembersForm>({
    resolver: zodResolver(inviteMembersFormSchema),
    defaultValues: { emails: "", projectRole: DEFAULT_PROJECT_ROLE }
  });

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

  const onInvite = async ({ emails, projectRole }: TInviteMembersForm) => {
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
        roleSlugs: [projectRole.slug]
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
            Infisical is better with your team. Bring your team in to review, rotate, and manage
            secrets together.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onInvite)} className="flex flex-col gap-4">
          <Controller
            control={control}
            name="emails"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="invite-members-emails">Emails</FieldLabel>
                <TextArea
                  id="invite-members-emails"
                  rows={1}
                  className="min-h-8"
                  isError={Boolean(error)}
                  placeholder="email@example.com, email2@example.com..."
                  {...field}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="projectRole"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field>
                <FieldLabel
                  htmlFor="invite-members-project-role"
                  className="flex items-center gap-1.5"
                >
                  Project role
                  <Tooltip>
                    <TooltipTrigger tabIndex={-1} asChild>
                      <span>
                        <InfoIcon className="size-3 text-muted" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-md">
                      Select which role to assign to the invited members in this project.
                    </TooltipContent>
                  </Tooltip>
                </FieldLabel>
                <FilterableSelect
                  inputId="invite-members-project-role"
                  isLoading={Boolean(projectId) && isProjectRolesLoading}
                  value={value}
                  onChange={onChange}
                  options={filteredRoles}
                  getOptionValue={(option) => option.slug}
                  getOptionLabel={(option) => option.name}
                  placeholder="Select role..."
                  isError={Boolean(error)}
                  components={{ Option: RoleOption }}
                />
                <FieldError>{error?.message}</FieldError>
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
              isDisabled={isSubmitting}
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
