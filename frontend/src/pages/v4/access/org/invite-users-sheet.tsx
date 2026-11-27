import { useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack, Inline } from "@infisical/cipher/ui/layout";
import { MultiSelect } from "@infisical/cipher/ui/multi-select";
import { Select } from "@infisical/cipher/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { TagsInput } from "@infisical/cipher/ui/tags-input";

import { isValidEmail, MAX_INVITE_EMAILS, normalizeEmail } from "@app/helpers/email";
import { getProjectTitle } from "@app/helpers/project";
import { findOrgMembershipRole } from "@app/helpers/roles";

import { RoleSelect } from "../../components/role-select";
import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { useOrgId } from "../permissions";
import { roleOptions } from "../roles";
import { failed, saved } from "../toast";
import { CopyButton } from "./detail-parts";
import { builtInProjectRoles, PRODUCTS } from "./products";

export type InviteLink = { email: string; link: string };

const NONE = "none";

const InviteLinks = ({ links }: { links: readonly InviteLink[] }) => (
  <Stack gap={16}>
    {links.map((invite) => (
      <Field key={invite.email} label={`Invite for ${invite.email}`}>
        <Inline gap={4} wrap={false}>
          <Input readOnly value={invite.link} aria-label={`Invitation link for ${invite.email}`} />
          <CopyButton
            value={invite.link}
            label={`Copy invitation link for ${invite.email}`}
            failure="Couldn't access the clipboard. Select the link in the field and copy it."
          />
        </Inline>
      </Field>
    ))}
  </Stack>
);

const InviteSheetHeader = ({
  subOrg,
  orgName,
  hasLinks
}: {
  subOrg: boolean;
  orgName: string;
  hasLinks: boolean;
}) =>
  subOrg ? (
    <SheetHeader>
      <SheetTitle>Add members</SheetTitle>
    </SheetHeader>
  ) : (
    <SheetHeader>
      <SheetTitle>{`Invite others to ${orgName}`}</SheetTitle>
      <SheetDescription>
        {hasLinks
          ? "No email provider is set up. Share these invite links manually."
          : "Invites are tied to one email address and expire after 1 day."}
      </SheetDescription>
    </SheetHeader>
  );

type PickerProps = { value: string[]; invalid: boolean; onChange: (next: string[]) => void };

const RootUserPicker = ({ open, ...props }: PickerProps & { open: boolean }) => {
  const { data: available = [], isPending } = useV4Adapter("access").useAvailableOrgUsers(open);
  return (
    <Combobox
      multiple
      label="Users"
      placeholder="Add one or more users..."
      emptyText={
        isPending
          ? "Loading users..."
          : "All root organization users are already in this sub-organization"
      }
      options={available.map(({ username }) => ({ value: username, label: username }))}
      {...props}
    />
  );
};

const validateInviteEmail = (tag: string, tags: readonly string[]) => {
  if (!isValidEmail(normalizeEmail(tag))) return `${tag} is not a valid email`;
  if (tags.length >= MAX_INVITE_EMAILS)
    return `You can invite up to ${MAX_INVITE_EMAILS} emails at once`;
  return undefined;
};

export const InviteUsersSheet = ({
  open,
  onOpenChange,
  links: initialLinks,
  subOrg = false
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  links?: readonly InviteLink[];
  subOrg?: boolean;
}) => {
  const access = useV4Adapter("access");
  const orgId = useOrgId();
  const session = useV4Session();
  const { data: orgRoles = [] } = access.useOrgRoles(orgId);
  const { data: organization } = access.useOrganization(orgId);
  const invite = access.useInviteOrgUsers();
  const addToProject = access.useAddProjectUsers();
  const defaultRole =
    (organization && findOrgMembershipRole(orgRoles, organization.defaultMembershipRole)?.slug) ??
    "member";
  const [emails, setEmails] = useState<string[]>([]);
  const [role, setRole] = useState<string>();
  const [product, setProduct] = useState(NONE);
  const [projects, setProjects] = useState<string[]>([]);
  const [projectRole, setProjectRole] = useState("member");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [createdLinks, setCreatedLinks] = useState<readonly InviteLink[]>();
  const links = initialLinks ?? createdLinks;
  const selectedProduct = PRODUCTS.find((entry) => entry.type === product);
  const singleProject = projects.length === 1 ? projects[0] : "";
  const { data: singleProjectRoles } = access.useProjectRoles(singleProject);

  const reset = () => {
    setEmails([]);
    setRole(undefined);
    setProduct(NONE);
    setProjects([]);
    setProjectRole("member");
    setError(undefined);
    setCreatedLinks(undefined);
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const availableProducts = PRODUCTS.filter((entry) =>
    session.projects.some((project) => project.type === entry.type)
  );
  const productProjects = selectedProduct
    ? session.projects.filter((project) => project.type === selectedProduct.type)
    : [];
  const projectRoleOptions = (() => {
    if (selectedProduct?.roles) return selectedProduct.roles;
    if (singleProject && singleProjectRoles) return roleOptions(singleProjectRoles);
    return builtInProjectRoles(selectedProduct?.type);
  })();

  const pick = (next: string[]) => {
    setEmails(next);
    setError(undefined);
  };

  const submit = async () => {
    if (!emails.length) {
      setError(subOrg ? "Select at least one user" : "Enter at least one email");
      return;
    }
    if (!subOrg && emails.length > MAX_INVITE_EMAILS) {
      setError(`You can invite up to ${MAX_INVITE_EMAILS} emails at once`);
      return;
    }
    const picked = new Set(projects);
    const targets = selectedProduct?.isSingleton
      ? productProjects.slice(0, 1)
      : productProjects.filter((project) => picked.has(project.id));
    setPending(true);
    try {
      const { data } = await invite.mutateAsync({
        organizationId: orgId,
        inviteeEmails: emails,
        organizationRoleSlug: role ?? defaultRole
      });
      const projectResults = await Promise.allSettled(
        targets.map((project) =>
          addToProject.mutateAsync({
            orgId,
            projectId: project.id,
            projectType: project.type,
            roleSlugs: [projectRole],
            usernames: emails
          })
        )
      );
      const projectFailure = projectResults.find((result) => result.status === "rejected");
      if (projectFailure) failed("Failed to add users to projects", projectFailure.reason);
      if (data.completeInviteLinks?.length) {
        setCreatedLinks(data.completeInviteLinks);
        return;
      }
      if (!projectFailure)
        saved(`Successfully invited user${emails.length > 1 ? "s" : ""} to the organization.`);
      close();
    } catch (err) {
      failed("Failed to invite users", err);
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <SheetContent pending={pending} onOpenAutoFocus={(event) => event.preventDefault()}>
        <InviteSheetHeader
          subOrg={subOrg}
          orgName={session.organization.name}
          hasLinks={Boolean(links)}
        />
        <SheetBody>
          {links ? (
            <InviteLinks links={links} />
          ) : (
            <form
              id="invite-users"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <Stack gap={16}>
                <Field label={subOrg ? "Users" : "Emails"} error={error}>
                  {subOrg ? (
                    <RootUserPicker
                      open={open}
                      value={emails}
                      invalid={Boolean(error)}
                      onChange={pick}
                    />
                  ) : (
                    <TagsInput
                      label="Emails"
                      placeholder="email@example.com, email2@example.com"
                      value={emails}
                      invalid={Boolean(error)}
                      onChange={(next) => pick([...new Set(next.map(normalizeEmail))])}
                      validate={validateInviteEmail}
                      onValidationChange={setError}
                    />
                  )}
                </Field>
                <Field label="Assign organization role">
                  <RoleSelect
                    label="Assign organization role"
                    value={role ?? defaultRole}
                    onChange={setRole}
                    roles={orgRoles}
                  />
                </Field>
                <Field label="Assign users to a product" optional>
                  <Select
                    label="Assign users to a product"
                    placeholder="Select a product..."
                    value={product}
                    onChange={(value) => {
                      setProduct(value);
                      setProjects([]);
                      setProjectRole("member");
                    }}
                    options={[
                      { value: NONE, label: "None" },
                      ...availableProducts.map((entry) => ({
                        value: entry.type,
                        label: getProjectTitle(entry.type)
                      }))
                    ]}
                  />
                </Field>
                {selectedProduct && !selectedProduct.isSingleton && (
                  <Field label="Assign users to projects" optional>
                    <MultiSelect
                      label="Assign users to projects"
                      placeholder="Select projects..."
                      searchable
                      options={productProjects.map((project) => ({
                        value: project.id,
                        label: project.name
                      }))}
                      value={projects}
                      onChange={(next) => {
                        setProjects(next);
                        setProjectRole("member");
                      }}
                    />
                  </Field>
                )}
                {selectedProduct && (
                  <Field
                    label={selectedProduct.isSingleton ? "Product role" : "Project role"}
                    description={
                      selectedProduct.isSingleton || projects.length < 2
                        ? undefined
                        : "Only built-in roles are available for multiple projects."
                    }
                  >
                    <RoleSelect
                      label={selectedProduct.isSingleton ? "Product role" : "Project role"}
                      value={projectRole}
                      onChange={setProjectRole}
                      options={projectRoleOptions}
                    />
                  </Field>
                )}
              </Stack>
            </form>
          )}
        </SheetBody>
        <SheetFooter>
          <Inline gap={8} justify="end">
            {links ? (
              <Button variant="primary" onClick={close}>
                Done
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" form="invite-users" loading={pending}>
                  Add members
                </Button>
              </>
            )}
          </Inline>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
