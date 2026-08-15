import { useEffect } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Combobox,
  Field,
  FieldError,
  FieldLabel,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
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
    <Sheet
      open={popUp?.addMember?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("addMember", isOpen);
        setCompleteInviteLinks(null);
      }}
    >
      <SheetContent className="w-full gap-0 sm:max-w-xl">
        <SheetHeader className="shrink-0 pr-12">
          <SheetTitle>Invite others to {currentOrg?.name}</SheetTitle>
          <SheetDescription>
            {completeInviteLinks
              ? "This Infisical instance does not have a email provider setup. Please share this invite link with the invitee manually"
              : "An invite is specific to an email address and expires after 1 day."}
          </SheetDescription>
        </SheetHeader>
        {!completeInviteLinks && (
          <FormProvider {...methods}>
            <form onSubmit={handleSubmit(onAddMembers)} className="flex min-h-0 flex-1 flex-col">
              <div className="thin-scrollbar flex-1 space-y-4 overflow-y-auto p-4">
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
                    <Field>
                      <FieldLabel
                        htmlFor="add-org-member-org-role"
                        className="flex items-center gap-1.5"
                      >
                        Assign organization role
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Info className="size-3 text-muted" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-md">
                            Select which organization role you want to assign to the user.
                          </TooltipContent>
                        </Tooltip>
                      </FieldLabel>
                      <Combobox
                        id="add-org-member-org-role"
                        options={organizationRoles ?? []}
                        value={value}
                        onValueChange={onChange}
                        getOptionValue={(option) => option.slug}
                        getOptionLabel={(option) => option.name}
                        getOptionKeywords={(option) =>
                          option.description ? [option.description] : []
                        }
                        placeholder="Select role..."
                        searchPlaceholder="Search roles..."
                        searchAriaLabel="Search organization roles"
                        emptyMessage="No organization roles found."
                        isError={Boolean(error)}
                        isLoading={isOrganizationRolesPending}
                        modal
                        renderOption={(option) => (
                          <div className="min-w-0">
                            <p className="truncate">{option.name}</p>
                            {option.description ? (
                              <p className="text-xs leading-4 break-words whitespace-normal text-muted">
                                {option.description}
                              </p>
                            ) : (
                              <p className="text-xs leading-4 text-muted/65">No Description</p>
                            )}
                          </div>
                        )}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />

                <ProjectAssignmentFields />
              </div>

              <SheetFooter className="shrink-0 justify-end border-t bg-popover">
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => handlePopUpToggle("addMember", false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="org"
                  type="submit"
                  isPending={isSubmitting}
                  isDisabled={isSubmitting}
                >
                  Add Member
                </Button>
              </SheetFooter>
            </form>
          </FormProvider>
        )}
        {completeInviteLinks && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="thin-scrollbar flex-1 space-y-3 overflow-y-auto p-4">
              {completeInviteLinks.map((invite) => (
                <OrgInviteLink key={`invite-${invite.email}`} invite={invite} />
              ))}
            </div>
            <SheetFooter className="shrink-0 justify-end border-t bg-popover">
              <SheetClose asChild>
                <Button type="button" variant="org">
                  Done
                </Button>
              </SheetClose>
            </SheetFooter>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
