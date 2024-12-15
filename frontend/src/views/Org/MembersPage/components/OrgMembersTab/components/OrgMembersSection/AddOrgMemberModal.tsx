import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FilterableSelect,
  FormControl,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  TextArea
} from "@app/components/v2";
import { useOrganization } from "@app/context";
import { findOrgMembershipRole } from "@app/helpers/roles";
import {
  useAddUsersToOrg,
  useFetchServerStatus,
  useGetOrgRoles,
  useGetUserWorkspaces
} from "@app/hooks/api";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { ProjectVersion } from "@app/hooks/api/workspace/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { OrgInviteLink } from "./OrgInviteLink";

const DEFAULT_ORG_AND_PROJECT_MEMBER_ROLE_SLUG = "member";

const EmailSchema = z.string().email().min(1).trim().toLowerCase();

const addMemberFormSchema = z.object({
  emails: z.string().min(1).trim().toLowerCase(),
  projects: z
    .array(
      z.object({
        name: z.string(),
        id: z.string(),
        slug: z.string(),
        version: z.nativeEnum(ProjectVersion)
      })
    )
    .default([]),
  projectRoleSlug: z.string().min(1).default(DEFAULT_ORG_AND_PROJECT_MEMBER_ROLE_SLUG),
  organizationRole: z.object({ name: z.string(), slug: z.string() })
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

  const { data: organizationRoles } = useGetOrgRoles(currentOrg?.id ?? "");
  const { data: serverDetails } = useFetchServerStatus();
  const { mutateAsync: addUsersMutateAsync } = useAddUsersToOrg();
  const { data: projects, isLoading: isProjectsLoading } = useGetUserWorkspaces({
    includeRoles: true
  });

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { isSubmitting }
  } = useForm<TAddMemberForm>({
    resolver: zodResolver(addMemberFormSchema)
  });

  // set initial form role based off org default role
  useEffect(() => {
    if (organizationRoles) {
      reset({
        organizationRole: findOrgMembershipRole(
          organizationRoles,
          currentOrg?.defaultMembershipRole!
        )
      });
    }
  }, [organizationRoles]);

  const onAddMembers = async ({
    emails,
    organizationRole,
    projects: selectedProjects,
    projectRoleSlug
  }: TAddMemberForm) => {
    if (!currentOrg?.id) return;

    if (selectedProjects?.length) {
      // eslint-disable-next-line no-restricted-syntax
      for (const project of selectedProjects) {
        if (project.version !== ProjectVersion.V3) {
          createNotification({
            type: "error",
            text: `Cannot add users to project "${project.name}" because it's incompatible. Please upgrade the project.`
          });
          return;
        }
      }
    }

    try {
      const parsedEmails = emails
        .replace(/\s/g, "")
        .split(",")
        .map((email) => {
          if (EmailSchema.safeParse(email).success) {
            return email.trim();
          }

          return null;
        });

      if (parsedEmails.includes(null)) {
        createNotification({
          text: "Invalid email addresses provided.",
          type: "error"
        });
        return;
      }

      const { data } = await addUsersMutateAsync({
        organizationId: currentOrg?.id,
        inviteeEmails: emails.split(",").map((email) => email.trim()),
        organizationRoleSlug: organizationRole.slug,
        projects: selectedProjects.map(({ id }) => ({ id, projectRoleSlug: [projectRoleSlug] }))
      });

      setCompleteInviteLinks(data?.completeInviteLinks ?? null);

      // only show this notification when email is configured.
      // A [completeInviteLink] will not be sent if smtp is configured

      if (!data.completeInviteLinks) {
        createNotification({
          text: "Successfully invited user to the organization.",
          type: "success"
        });
      }
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to invite user to org",
        type: "error"
      });
    }

    if (serverDetails?.emailConfigured) {
      handlePopUpToggle("addMember", false);
    }

    reset();
  };

  return (
    <Modal
      isOpen={popUp?.addMember?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("addMember", isOpen);
        setCompleteInviteLinks(null);
      }}
    >
      <ModalContent
        bodyClassName="overflow-visible"
        title={`Invite others to ${currentOrg?.name}`}
        subTitle={
          <div>
            {!completeInviteLinks && (
              <div>An invite is specific to an email address and expires after 1 day.</div>
            )}
            {completeInviteLinks &&
              "This Infisical instance does not have a email provider setup. Please share this invite link with the invitee manually"}
          </div>
        }
      >
        {!completeInviteLinks && (
          <form onSubmit={handleSubmit(onAddMembers)}>
            <Controller
              control={control}
              name="emails"
              render={({ field, fieldState: { error } }) => (
                <FormControl label="Emails" isError={Boolean(error)} errorText={error?.message}>
                  <TextArea
                    {...field}
                    className="mt-1 h-20 w-full min-w-[30rem] rounded-md border border-mineshaft-500 bg-mineshaft-900/70 py-1 px-2 text-sm text-bunker-300 outline-none ring-primary-800 ring-opacity-70 transition-all placeholder:text-bunker-400 focus:ring-2"
                    placeholder="email@example.com, email2@example.com..."
                  />
                </FormControl>
              )}
            />

            <Controller
              control={control}
              name="organizationRole"
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  tooltipText="Select which organization role you want to assign to the user."
                  label="Assign organization role"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <FilterableSelect
                    placeholder="Select role..."
                    options={organizationRoles}
                    getOptionValue={(option) => option.slug}
                    getOptionLabel={(option) => option.name}
                    value={value}
                    onChange={onChange}
                  />
                </FormControl>
              )}
            />

            <div className="flex items-start justify-between gap-2">
              <div className="w-full">
                <Controller
                  control={control}
                  name="projects"
                  render={({ field: { value, onChange }, fieldState: { error } }) => (
                    <FormControl
                      label="Assign users to projects"
                      isOptional
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <FilterableSelect
                        isMulti
                        value={value}
                        onChange={onChange}
                        isLoading={isProjectsLoading}
                        getOptionLabel={(project) => project.name}
                        getOptionValue={(project) => project.id}
                        options={projects}
                        placeholder="Select projects..."
                      />
                    </FormControl>
                  )}
                />
              </div>
              <div className="mt-[0.15rem] flex min-w-fit justify-end">
                <Controller
                  control={control}
                  name="projectRoleSlug"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      tooltipText="Select which role to assign to the users in the selected projects."
                      label="Role"
                      isError={Boolean(error)}
                      errorText={error?.message}
                    >
                      <div>
                        <Select
                          isDisabled={watch("projects", []).length === 0}
                          defaultValue={DEFAULT_ORG_AND_PROJECT_MEMBER_ROLE_SLUG}
                          {...field}
                          onValueChange={(val) => field.onChange(val)}
                        >
                          {Object.entries(ProjectMembershipRole).map(
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                            ([_, slug]) =>
                              slug !== "custom" && (
                                <SelectItem key={slug} value={slug}>
                                  <span className="capitalize">{slug.replace("-", " ")}</span>
                                </SelectItem>
                              )
                          )}
                        </Select>
                      </div>
                    </FormControl>
                  )}
                />
              </div>
            </div>

            <div className="mt-8 flex items-center">
              <Button
                className="mr-4"
                size="sm"
                type="submit"
                isLoading={isSubmitting}
                isDisabled={isSubmitting}
              >
                Add Member
              </Button>
              <Button
                colorSchema="secondary"
                variant="plain"
                onClick={() => handlePopUpToggle("addMember", false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
        {completeInviteLinks && (
          <div className="space-y-3">
            {completeInviteLinks.map((invite) => (
              <OrgInviteLink key={`invite-${invite.email}`} invite={invite} />
            ))}
          </div>
        )}
      </ModalContent>
    </Modal>
  );
};
