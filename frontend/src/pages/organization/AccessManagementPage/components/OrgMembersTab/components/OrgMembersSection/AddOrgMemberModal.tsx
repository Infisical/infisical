import { useEffect } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, Field, FieldError, FieldLabel, SheetClose, TextArea } from "@app/components/v3";
import { useOrganization } from "@app/context";
import { emailListSchema, parseEmailList } from "@app/helpers/email";
import { findOrgMembershipRole } from "@app/helpers/roles";
import {
  useAddUsersToOrg,
  useAddUserToWsNonE2EE,
  useFetchServerStatus,
  useGetOrgRoles,
  useGetUserProjects
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

import {
  MemberFormSheet,
  MemberFormSheetBody,
  MemberFormSheetFooter,
  MemberFormSheetForm
} from "./MemberFormSheet";
import { OrganizationRoleField } from "./OrganizationRoleField";
import { OrgInviteLink } from "./OrgInviteLink";
import {
  ProjectAssignmentFields,
  projectAssignmentSchema,
  resolveTargetProjects
} from "./ProjectAssignmentFields";
import { DEFAULT_PROJECT_ROLE } from "./ProjectRoleSelect";

const addMemberFormSchema = projectAssignmentSchema.extend({
  emails: emailListSchema,
  organizationRole: z.object({
    name: z.string(),
    slug: z.string(),
    description: z.string().optional()
  })
});

type TAddMemberForm = z.infer<typeof addMemberFormSchema>;

type Props = {
  popUp: UsePopUpState<["addMember"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["addMember"]>, state?: boolean) => void;
  completeInviteLinks: Array<{
    email: string;
    link: string;
  }> | null;
  setCompleteInviteLinks: (links: Array<{ email: string; link: string }> | null) => void;
};

export const AddOrgMemberModal = ({
  popUp,
  handlePopUpToggle,
  completeInviteLinks,
  setCompleteInviteLinks
}: Props) => {
  const { currentOrg } = useOrganization();

  const { data: organizationRoles, isPending: isOrganizationRolesPending } = useGetOrgRoles(
    currentOrg?.id ?? ""
  );
  const { data: serverDetails } = useFetchServerStatus();
  const { mutateAsync: addUsersMutateAsync } = useAddUsersToOrg();
  const { mutateAsync: addUserToProject } = useAddUserToWsNonE2EE();
  const { data: rawProjects } = useGetUserProjects({
    includeRoles: true
  });

  const methods = useForm<TAddMemberForm>({
    resolver: zodResolver(addMemberFormSchema)
  });
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = methods;

  // set initial form role based off org default role
  useEffect(() => {
    if (organizationRoles) {
      reset({
        organizationRole: findOrgMembershipRole(
          organizationRoles,
          currentOrg.defaultMembershipRole
        ),
        projectRole: DEFAULT_PROJECT_ROLE
      });
    }
  }, [organizationRoles]);

  const onAddMembers = async ({
    emails,
    organizationRole,
    product,
    projects: projectsToInvite,
    projectRole
  }: TAddMemberForm) => {
    if (!currentOrg?.id) return;

    const targetProjects = resolveTargetProjects(product, projectsToInvite, rawProjects);
    if (!targetProjects) return;

    const usernames = parseEmailList(emails);
    const { data } = await addUsersMutateAsync({
      organizationId: currentOrg?.id,
      inviteeEmails: usernames,
      organizationRoleSlug: organizationRole.slug
    });

    await Promise.allSettled(
      targetProjects.map((el) =>
        addUserToProject({
          orgId: currentOrg.id,
          projectId: el.id,
          projectType: el.type,
          roleSlugs: [projectRole.slug],
          usernames
        })
      )
    );

    if (data?.completeInviteLinks && data?.completeInviteLinks.length > 0) {
      setCompleteInviteLinks(data.completeInviteLinks);
    }

    // only show this notification when email is configured.
    // A [completeInviteLink] will not be sent if smtp is configured

    if (!data.completeInviteLinks?.length) {
      createNotification({
        text: `Successfully invited user${usernames.length > 1 ? "s" : ""} to the organization.`,
        type: "success"
      });
    }

    if (serverDetails?.emailConfigured) {
      handlePopUpToggle("addMember", false);
    }

    reset({
      emails: "",
      product: undefined,
      projects: [],
      projectRole: DEFAULT_PROJECT_ROLE,
      organizationRole: organizationRoles
        ? findOrgMembershipRole(organizationRoles, currentOrg.defaultMembershipRole)
        : undefined
    });
  };

  return (
    <MemberFormSheet
      open={popUp?.addMember?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("addMember", isOpen);
        setCompleteInviteLinks(null);
      }}
      title={`Invite others to ${currentOrg?.name}`}
      description={
        completeInviteLinks
          ? "This Infisical instance does not have a email provider setup. Please share this invite link with the invitee manually"
          : "An invite is specific to an email address and expires after 1 day."
      }
    >
      {!completeInviteLinks && (
        <FormProvider {...methods}>
          <MemberFormSheetForm
            onSubmit={handleSubmit(onAddMembers)}
            onCancel={() => handlePopUpToggle("addMember", false)}
            submitVariant="org"
            isSubmitting={isSubmitting}
          >
            <Controller
              control={control}
              name="emails"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="add-org-member-emails">Emails</FieldLabel>
                  <TextArea
                    id="add-org-member-emails"
                    className="h-24"
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
              name="organizationRole"
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <OrganizationRoleField
                  id="add-org-member-org-role"
                  options={organizationRoles ?? []}
                  value={value}
                  onValueChange={onChange}
                  isError={Boolean(error)}
                  errorMessage={error?.message}
                  isLoading={isOrganizationRolesPending}
                />
              )}
            />

            <ProjectAssignmentFields />
          </MemberFormSheetForm>
        </FormProvider>
      )}
      {completeInviteLinks && (
        <div className="flex min-h-0 flex-1 flex-col">
          <MemberFormSheetBody>
            {completeInviteLinks.map((invite) => (
              <OrgInviteLink key={`invite-${invite.email}`} invite={invite} />
            ))}
          </MemberFormSheetBody>
          <MemberFormSheetFooter>
            <SheetClose asChild>
              <Button type="button" variant="org">
                Done
              </Button>
            </SheetClose>
          </MemberFormSheetFooter>
        </div>
      )}
    </MemberFormSheet>
  );
};
