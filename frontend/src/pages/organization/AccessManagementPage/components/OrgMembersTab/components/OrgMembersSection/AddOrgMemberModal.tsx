import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { RoleOption } from "@app/components/roles";
import {
  Button,
  FilterableSelect,
  FormControl,
  Modal,
  ModalContent,
  TextArea
} from "@app/components/v2";
import { useOrganization } from "@app/context";
import { findOrgMembershipRole } from "@app/helpers/roles";
import {
  useAddUsersToOrg,
  useAddUserToWsNonE2EE,
  useFetchServerStatus,
  useGetOrgRoles,
  useGetProjectRoles,
  useGetUserProjects
} from "@app/hooks/api";
import { ProjectType, ProjectVersion } from "@app/hooks/api/projects/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { OrgInviteLink } from "./OrgInviteLink";

const DEFAULT_PROJECT_ROLE = { slug: "member", name: "Member" };

const BUILT_IN_PROJECT_ROLES = [
  { slug: "admin", name: "Admin" },
  { slug: "member", name: "Member" },
  { slug: "viewer", name: "Viewer" },
  { slug: "no-access", name: "No Access" }
];

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
  projectRole: z
    .object({
      slug: z.string().min(1),
      name: z.string().min(1)
    })
    .default(DEFAULT_PROJECT_ROLE),
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

  const { data: organizationRoles } = useGetOrgRoles(currentOrg?.id ?? "");
  const { data: serverDetails } = useFetchServerStatus();
  const { mutateAsync: addUsersMutateAsync } = useAddUsersToOrg();
  const { mutateAsync: addUserToProject } = useAddUserToWsNonE2EE();
  const { data: projects, isPending: isProjectsLoading } = useGetUserProjects({
    includeRoles: true
  });

  const {
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { isSubmitting }
  } = useForm<TAddMemberForm>({
    resolver: zodResolver(addMemberFormSchema)
  });

  const selectedProjects = watch("projects", []);
  const singleSelectedProjectId =
    selectedProjects.length === 1 ? selectedProjects[0].id : undefined;
  const { data: fetchedProjectRoles, isPending: isProjectRolesLoading } = useGetProjectRoles(
    singleSelectedProjectId ?? ""
  );
  const projectRoles = fetchedProjectRoles ?? BUILT_IN_PROJECT_ROLES;

  useEffect(() => {
    setValue("projectRole", DEFAULT_PROJECT_ROLE);
  }, [singleSelectedProjectId, setValue]);

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
    projects: projectsToInvite,
    projectRole
  }: TAddMemberForm) => {
    if (!currentOrg?.id) return;

    if (projectsToInvite?.length) {
      // eslint-disable-next-line no-restricted-syntax
      for (const project of projectsToInvite) {
        if (project.version !== ProjectVersion.V3) {
          createNotification({
            type: "error",
            text: `Cannot add users to project "${project.name}" because it's incompatible. Please upgrade the project.`
          });
          return;
        }
      }
    }

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

    const usernames = emails.split(",").map((email) => email.trim());
    const { data } = await addUsersMutateAsync({
      organizationId: currentOrg?.id,
      inviteeEmails: usernames,
      organizationRoleSlug: organizationRole.slug
    });

    await Promise.allSettled(
      projectsToInvite.map((el) =>
        addUserToProject({
          orgId: currentOrg.id,
          projectId: el.id,
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
      projects: [],
      projectRole: DEFAULT_PROJECT_ROLE,
      organizationRole: organizationRoles
        ? findOrgMembershipRole(organizationRoles, currentOrg.defaultMembershipRole)
        : undefined
    });
  };

  const getGroupHeaderLabel = (type: ProjectType) => {
    switch (type) {
      case ProjectType.SecretManager:
        return "Secrets";
      case ProjectType.CertificateManager:
        return "PKI";
      case ProjectType.KMS:
        return "KMS";
      case ProjectType.SSH:
        return "SSH";
      default:
        return "Other";
    }
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
                    className="ring-opacity-70 mt-1 h-20 w-full min-w-120 rounded-md border border-mineshaft-500 bg-mineshaft-900/70 px-2 py-1 text-sm text-bunker-300 ring-primary-800 outline-hidden transition-all placeholder:text-bunker-400 focus:ring-2"
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
                    components={{ Option: RoleOption }}
                  />
                </FormControl>
              )}
            />

            <div className="flex items-end justify-between gap-2">
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
                        groupBy="type"
                        getGroupHeaderLabel={getGroupHeaderLabel}
                        placeholder="Select projects..."
                      />
                    </FormControl>
                  )}
                />
              </div>
              <div className="w-48 flex-shrink-0">
                <Controller
                  control={control}
                  name="projectRole"
                  render={({ field: { value, onChange }, fieldState: { error } }) => (
                    <FormControl
                      tooltipText={
                        <>
                          Select which role to assign to the users in the selected projects.
                          <br />
                          When multiple projects are selected, only built-in roles are available for
                          selection.
                          <br />
                          You can assign users to additional projects after they&apos;ve been
                          invited.
                        </>
                      }
                      label="Role"
                      isError={Boolean(error)}
                      errorText={error?.message}
                    >
                      <FilterableSelect
                        isDisabled={selectedProjects.length === 0}
                        isLoading={Boolean(singleSelectedProjectId) && isProjectRolesLoading}
                        value={value}
                        onChange={onChange}
                        options={projectRoles ?? []}
                        getOptionValue={(option) => option.slug}
                        getOptionLabel={(option) => option.name}
                        placeholder="Select role..."
                      />
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
