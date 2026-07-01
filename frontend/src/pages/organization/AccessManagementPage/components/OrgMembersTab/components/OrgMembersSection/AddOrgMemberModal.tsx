import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { components, OptionProps, SingleValueProps } from "react-select";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon, Info } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { RoleOption } from "@app/components/roles";
import {
  Button,
  Dialog,
  DialogClose,
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
import { useOrganization } from "@app/context";
import { getProjectLucideIcon, getProjectTitle } from "@app/helpers/project";
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
  { slug: "admin", name: "Admin", description: "Full administrative access over a project" },
  { slug: "member", name: "Member", description: "Limited read/write role in a project" },
  { slug: "viewer", name: "Viewer", description: "Only read role in a project" },
  { slug: "no-access", name: "No Access", description: "No access to any resources in the project" }
];

const CERT_MANAGER_ROLES = [
  {
    slug: "admin",
    name: "Admin",
    description: "Full administrative access over Certificate Manager"
  },
  {
    slug: "member",
    name: "Member",
    description: "Access scoped to the Applications and Code Signers they've been added to"
  }
];

type ProductDefinition = {
  type: ProjectType;
  name: string;
  isSingleton: boolean;
  roles?: { slug: string; name: string; description: string }[];
};

// Names come from the shared getProjectTitle util so the select matches the Projects pages.
const PRODUCT_DEFINITIONS: ProductDefinition[] = [
  {
    type: ProjectType.SecretManager,
    name: getProjectTitle(ProjectType.SecretManager),
    isSingleton: false
  },
  {
    type: ProjectType.CertificateManager,
    name: getProjectTitle(ProjectType.CertificateManager),
    isSingleton: true,
    roles: CERT_MANAGER_ROLES
  },
  { type: ProjectType.KMS, name: getProjectTitle(ProjectType.KMS), isSingleton: false },
  { type: ProjectType.SSH, name: getProjectTitle(ProjectType.SSH), isSingleton: false },
  {
    type: ProjectType.SecretScanning,
    name: getProjectTitle(ProjectType.SecretScanning),
    isSingleton: false
  }
];

// Render each product with its shared project icon (getProjectLucideIcon) so the select matches the
// Projects pages and the org sidebar.
const ProductOption = ({ isSelected, children, ...props }: OptionProps<ProductDefinition>) => {
  const Icon = getProjectLucideIcon(props.data.type);
  return (
    <components.Option isSelected={isSelected} {...props}>
      <div className="flex flex-row items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted" />
        <p className="mr-auto truncate">{children}</p>
        {isSelected && <CheckIcon className="ml-2 size-4 shrink-0" />}
      </div>
    </components.Option>
  );
};

const ProductSingleValue = ({ children, ...props }: SingleValueProps<ProductDefinition>) => {
  const Icon = getProjectLucideIcon(props.data.type);
  return (
    <components.SingleValue {...props}>
      <div className="flex flex-row items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted" />
        <span className="truncate">{children}</span>
      </div>
    </components.SingleValue>
  );
};

const EmailSchema = z.string().email().min(1).trim().toLowerCase();

// Zod's .email() accepts addresses the backend/DB reject: domain labels over 63 chars
// (backend/src/lib/validator/validate-email.ts) and emails longer than the users table's
// varchar(255) email/username columns. Mirror both here so oversized/malformed addresses are
// caught inline instead of failing with a 400 (bad domain) or 500 (too long) from the API.
const MAX_EMAIL_LENGTH = 255;
const MAX_DOMAIN_LABEL_LENGTH = 63;
const DOMAIN_LABEL_REGEX = /^[a-zA-Z0-9-]+$/;
const TLD_REGEX = /^[a-zA-Z0-9]+$/;

const isValidEmailDomain = (domain: string) => {
  const labels = domain.split(".");
  if (labels.length < 2) return false;

  const tld = labels[labels.length - 1];
  if (tld.length < 2 || !TLD_REGEX.test(tld)) return false;

  return labels.every(
    (label) =>
      label.length > 0 &&
      label.length <= MAX_DOMAIN_LABEL_LENGTH &&
      !label.startsWith("-") &&
      !label.endsWith("-") &&
      DOMAIN_LABEL_REGEX.test(label)
  );
};

const isValidEmail = (email: string) =>
  email.length <= MAX_EMAIL_LENGTH &&
  EmailSchema.safeParse(email).success &&
  isValidEmailDomain(email.slice(email.indexOf("@") + 1));

// Mirror the backend cap (inviteeEmails.array().max(100)) so oversized invites are rejected inline
// before hitting the API.
const MAX_INVITE_EMAILS = 100;

const parseEmailList = (value: string) =>
  value
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);

const addMemberFormSchema = z.object({
  emails: z
    .string()
    .trim()
    .toLowerCase()
    .superRefine((value, ctx) => {
      const emails = parseEmailList(value);

      if (!emails.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Please enter at least one email address."
        });
        return;
      }

      if (emails.length > MAX_INVITE_EMAILS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `You can invite up to ${MAX_INVITE_EMAILS} users at a time.`
        });
      }

      const invalidEmails = emails.filter((email) => !isValidEmail(email));

      if (invalidEmails.length) {
        const preview = invalidEmails
          .slice(0, 3)
          .map((email) => (email.length > 40 ? `${email.slice(0, 40)}...` : email))
          .join(", ");
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            invalidEmails.length > 3
              ? `${invalidEmails.length} invalid email addresses (e.g. ${preview}).`
              : `Invalid email address${invalidEmails.length > 1 ? "es" : ""}: ${preview}.`
        });
      }
    }),
  product: z
    .object({
      type: z.nativeEnum(ProjectType),
      name: z.string(),
      isSingleton: z.boolean(),
      roles: z
        .object({
          slug: z.string(),
          name: z.string(),
          description: z.string()
        })
        .array()
        .optional()
    })
    .optional(),
  projects: z
    .array(
      z.object({
        name: z.string(),
        id: z.string(),
        slug: z.string(),
        version: z.nativeEnum(ProjectVersion),
        type: z.nativeEnum(ProjectType).optional()
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
  const { data: rawProjects, isPending: isProjectsLoading } = useGetUserProjects({
    includeRoles: true
  });

  const availableProducts = useMemo(
    () => PRODUCT_DEFINITIONS.filter((def) => rawProjects?.some((p) => p.type === def.type)),
    [rawProjects]
  );

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

  const selectedProduct = watch("product");
  const isSingletonProduct = Boolean(selectedProduct?.isSingleton);

  const productProjects = useMemo(() => {
    if (!rawProjects || !selectedProduct || selectedProduct.isSingleton) return [];
    return rawProjects.filter((p) => p.type === selectedProduct.type);
  }, [rawProjects, selectedProduct]);

  const selectedProjects = watch("projects", []);
  const singleSelectedProjectId =
    selectedProjects.length === 1 ? selectedProjects[0].id : undefined;
  const { data: fetchedProjectRoles, isPending: isProjectRolesLoading } = useGetProjectRoles(
    singleSelectedProjectId ?? ""
  );

  // eslint-disable-next-line no-nested-ternary
  const projectRoles = selectedProduct?.roles
    ? selectedProduct.roles
    : fetchedProjectRoles?.length
      ? fetchedProjectRoles
      : BUILT_IN_PROJECT_ROLES;

  useEffect(() => {
    setValue("projectRole", DEFAULT_PROJECT_ROLE);
  }, [singleSelectedProjectId, selectedProduct?.type, setValue]);

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

    let targetProjects: typeof projectsToInvite = [];
    if (product?.isSingleton) {
      const singletonProject = rawProjects?.find((p) => p.type === product.type);
      if (singletonProject) targetProjects = [singletonProject];
    } else if (product) {
      targetProjects = projectsToInvite;
    }

    if (!isSingletonProduct) {
      // eslint-disable-next-line no-restricted-syntax
      for (const project of targetProjects) {
        if (project.version !== ProjectVersion.V3) {
          createNotification({
            type: "error",
            text: `Cannot add users to project "${project.name}" because it's incompatible. Please upgrade the project.`
          });
          return;
        }
      }
    }

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
    <Dialog
      open={popUp?.addMember?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("addMember", isOpen);
        setCompleteInviteLinks(null);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Invite others to {currentOrg?.name}</DialogTitle>
          <DialogDescription>
            {completeInviteLinks
              ? "This Infisical instance does not have a email provider setup. Please share this invite link with the invitee manually"
              : "An invite is specific to an email address and expires after 1 day."}
          </DialogDescription>
        </DialogHeader>
        {!completeInviteLinks && (
          <form onSubmit={handleSubmit(onAddMembers)} className="flex flex-col gap-4">
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
                  <FilterableSelect
                    inputId="add-org-member-org-role"
                    placeholder="Select role..."
                    options={organizationRoles}
                    getOptionValue={(option) => option.slug}
                    getOptionLabel={(option) => option.name}
                    value={value}
                    onChange={onChange}
                    isError={Boolean(error)}
                    components={{ Option: RoleOption }}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />

            <Controller
              control={control}
              name="product"
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field>
                  <FieldLabel
                    htmlFor="add-org-member-product"
                    className="flex items-center gap-1.5"
                  >
                    Assign users to a product
                    <span className="text-xs font-normal text-muted">(optional)</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Info className="size-3 text-muted" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md">
                        Select which product to grant the users access to.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <FilterableSelect
                    inputId="add-org-member-product"
                    isClearable
                    value={value ?? null}
                    isLoading={isProjectsLoading}
                    onChange={(option) => {
                      onChange(option);
                      setValue("projects", []);
                      setValue("projectRole", DEFAULT_PROJECT_ROLE);
                    }}
                    getOptionLabel={(product) => product.name}
                    getOptionValue={(product) => product.type}
                    options={availableProducts}
                    placeholder="Select a product..."
                    isError={Boolean(error?.message)}
                    components={{ Option: ProductOption, SingleValue: ProductSingleValue }}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />

            {selectedProduct && !isSingletonProduct && (
              <Controller
                control={control}
                name="projects"
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel
                      htmlFor="add-org-member-projects"
                      className="flex items-center gap-1.5"
                    >
                      Assign users to projects
                      <span className="text-xs font-normal text-muted">(optional)</span>
                    </FieldLabel>
                    <FilterableSelect
                      inputId="add-org-member-projects"
                      isMulti
                      value={value}
                      onChange={onChange}
                      isLoading={isProjectsLoading}
                      getOptionLabel={(project) => project.name}
                      getOptionValue={(project) => project.id}
                      options={productProjects}
                      placeholder="Select projects..."
                      isError={Boolean(error?.message)}
                    />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
            )}

            {selectedProduct && (
              <Controller
                control={control}
                name="projectRole"
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel
                      htmlFor="add-org-member-project-role"
                      className="flex items-center gap-1.5"
                    >
                      {isSingletonProduct ? "Product role" : "Project role"}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Info className="size-3 text-muted" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-md whitespace-pre-line">
                          {isSingletonProduct ? (
                            "Select which role to assign to the users for this product."
                          ) : (
                            <>
                              Select which role to assign to the users in the selected projects.
                              <br />
                              <br />
                              When multiple projects are selected, only built-in roles are available
                              for selection.
                              <br />
                              <br />
                              You can assign users to additional projects after they&apos;ve been
                              invited.
                            </>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </FieldLabel>
                    <FilterableSelect
                      inputId="add-org-member-project-role"
                      isDisabled={!isSingletonProduct && selectedProjects.length === 0}
                      isLoading={Boolean(singleSelectedProjectId) && isProjectRolesLoading}
                      value={value}
                      onChange={onChange}
                      options={projectRoles ?? []}
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
            )}

            <DialogFooter>
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
            </DialogFooter>
          </form>
        )}
        {completeInviteLinks && (
          <>
            <div className="space-y-3">
              {completeInviteLinks.map((invite) => (
                <OrgInviteLink key={`invite-${invite.email}`} invite={invite} />
              ))}
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="org">
                  Done
                </Button>
              </DialogClose>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
