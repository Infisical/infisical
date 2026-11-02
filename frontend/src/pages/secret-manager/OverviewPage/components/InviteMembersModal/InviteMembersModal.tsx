import { useEffect, useMemo, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InfoIcon, SendHorizontalIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { RoleOptionContent } from "@app/components/roles";
import {
  Button,
  Combobox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmailInput,
  Field,
  FieldError,
  FieldLabel,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization, useProject, useProjectPermission } from "@app/context";
import { emailListSchema, MAX_INVITE_EMAILS } from "@app/helpers/email";
import { useAddUserToWsNonE2EE, useGetProjectRoles } from "@app/hooks/api";
import { ProjectVersion } from "@app/hooks/api/projects/types";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { analytics, AnalyticsEvent } from "@app/lib/analytics";
import { SecretsActivationProperties } from "@app/lib/analytics/events";
import { filterByGrantConditions, getMemberAssignRoleConditions } from "@app/lib/fn/permission";

const DEFAULT_PROJECT_ROLE = { slug: "member", name: "Member" };

const inviteMembersFormSchema = z.object({
  emails: emailListSchema({ max: MAX_INVITE_EMAILS, isRequired: true }),
  projectRole: z
    .object({
      slug: z.string().min(1),
      name: z.string().min(1)
    })
    .default(DEFAULT_PROJECT_ROLE)
});

type TInviteMembersForm = z.infer<typeof inviteMembersFormSchema>;

type Props = {
  experimentVariant: "control" | null;
  popUp: UsePopUpState<["inviteMembers"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["inviteMembers"]>, state?: boolean) => void;
};

export const InviteMembersModal = ({ popUp, handlePopUpToggle, experimentVariant }: Props) => {
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
    defaultValues: { emails: [], projectRole: DEFAULT_PROJECT_ROLE }
  });

  const { mutateAsync: addUserToProject } = useAddUserToWsNonE2EE();

  const baseEventProps: SecretsActivationProperties = {
    projectId,
    projectType: currentProject?.type,
    presentation: "modal",
    experiment_variant: experimentVariant,
    "$feature/secrets-activation-presentation": experimentVariant
  };
  const hasViewedRef = useRef(false);

  const isOpen = popUp?.inviteMembers?.isOpen;
  useEffect(() => {
    if (isOpen && !hasViewedRef.current) {
      hasViewedRef.current = true;
      analytics.captureForOrganization(
        AnalyticsEvent.SecretsActivationModalViewed,
        orgId,
        baseEventProps
      );
    }
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

    if (emails.length) {
      await addUserToProject({
        usernames: emails,
        orgId: currentOrg.id,
        projectId: currentProject.id,
        projectType: currentProject.type,
        roleSlugs: [projectRole.slug]
      });
    }

    analytics.captureForOrganization(AnalyticsEvent.SecretsActivationModalMembersInvited, orgId, {
      ...baseEventProps,
      invitedCount: emails.length
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
        className="sm:max-w-md"
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
            render={({ field: { value, onChange, ref }, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="invite-members-emails">Emails</FieldLabel>
                <EmailInput
                  ref={ref}
                  id="invite-members-emails"
                  value={value}
                  onValueChange={onChange}
                  isError={Boolean(error)}
                  placeholder="email@example.com, email2@example.com..."
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
                <Combobox
                  id="invite-members-project-role"
                  isLoading={Boolean(projectId) && isProjectRolesLoading}
                  value={filteredRoles.find((role) => role.slug === value?.slug) ?? value}
                  isClearable={false}
                  onValueChange={onChange}
                  options={filteredRoles}
                  includeMissingSelectedOptions={false}
                  getOptionValue={(option) => option.slug}
                  getOptionKeywords={(option) => [option.slug]}
                  getOptionLabel={(option) => option.name}
                  placeholder="Select role..."
                  searchAriaLabel="Search roles"
                  isError={Boolean(error)}
                  renderOption={(option) => <RoleOptionContent role={option} />}
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
                analytics.captureForOrganization(
                  AnalyticsEvent.SecretsActivationModalDismissed,
                  orgId,
                  baseEventProps
                );
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
