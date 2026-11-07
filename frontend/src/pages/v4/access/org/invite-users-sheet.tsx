import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { Combobox } from "@app/components/v4/ui/combobox";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack, Inline } from "@app/components/v4/ui/layout";
import { MultiSelect } from "@app/components/v4/ui/multi-select";
import { Select } from "@app/components/v4/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { isValidEmail, MAX_INVITE_EMAILS, parseEmailList } from "@app/helpers/email";
import { getProjectTitle } from "@app/helpers/project";
import {
  AGENT_VAULT_PRODUCT_ROLE_OPTIONS,
  findOrgMembershipRole,
  PAM_PRODUCT_ROLE_OPTIONS
} from "@app/helpers/roles";
import { ProjectType } from "@app/hooks/api/projects/types";

import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { useOrgId } from "../permissions";
import { roleOptions } from "../roles";
import { failed, saved } from "../toast";
import { CopyButton } from "./detail-parts";

export type InviteLink = { email: string; link: string };

type RoleOption = { value: string; label: string; description?: string };

type Product = { type: ProjectType; isSingleton: boolean; roles?: readonly RoleOption[] };

const NONE = "none";

const CERT_MANAGER_ROLES: RoleOption[] = [
  {
    value: "admin",
    label: "Admin",
    description: "Full administrative access over Certificate Manager"
  },
  {
    value: "member",
    label: "Member",
    description: "Only the applications and code signers they're added to"
  }
];

const PRODUCTS: Product[] = [
  { type: ProjectType.SecretManager, isSingleton: false },
  { type: ProjectType.CertificateManager, isSingleton: true, roles: CERT_MANAGER_ROLES },
  { type: ProjectType.KMS, isSingleton: false },
  { type: ProjectType.SecretScanning, isSingleton: false },
  { type: ProjectType.PAM, isSingleton: true, roles: PAM_PRODUCT_ROLE_OPTIONS },
  { type: ProjectType.AgentVault, isSingleton: true, roles: AGENT_VAULT_PRODUCT_ROLE_OPTIONS }
];

const builtInProjectRoles = (type?: ProjectType): RoleOption[] => [
  { value: "admin", label: "Admin", description: "Full administrative access over a project" },
  { value: "member", label: "Member", description: "Limited read and write access" },
  ...(type === ProjectType.KMS
    ? [
        {
          value: "cryptographic-operator",
          label: "Cryptographic Operator",
          description: "Cryptographic operations such as encryption and signing"
        }
      ]
    : []),
  { value: "viewer", label: "Viewer", description: "Read-only access" },
  {
    value: "no-access",
    label: "No Access",
    description: "No access to project resources"
  }
];

const InviteLinks = ({ links }: { links: readonly InviteLink[] }) => (
  <Stack gap={16}>
    {links.map((invite) => (
      <Field key={invite.email} label={`Invite for ${invite.email}`}>
        <Inline gap={4} wrap={false}>
          <Input readOnly value={invite.link} aria-label={`Invitation link for ${invite.email}`} />
          <CopyButton value={invite.link} label={`Copy invitation link for ${invite.email}`} />
        </Inline>
      </Field>
    ))}
  </Stack>
);

export const InviteUsersSheet = ({
  open,
  onOpenChange,
  links: initialLinks
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  links?: readonly InviteLink[];
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

  const submit = async () => {
    if (!emails.length) {
      setError("Enter at least one email");
      return;
    }
    if (emails.length > MAX_INVITE_EMAILS) {
      setError(`You can invite up to ${MAX_INVITE_EMAILS} emails at once`);
      return;
    }
    const targets = selectedProduct?.isSingleton
      ? productProjects.slice(0, 1)
      : productProjects.filter((project) => projects.includes(project.id));
    setPending(true);
    try {
      const { data } = await invite.mutateAsync({
        organizationId: orgId,
        inviteeEmails: emails,
        organizationRoleSlug: role ?? defaultRole
      });
      await Promise.allSettled(
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
      if (data.completeInviteLinks?.length) {
        setCreatedLinks(data.completeInviteLinks);
        return;
      }
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
        <SheetHeader>
          <SheetTitle>{`Invite others to ${session.organization.name}`}</SheetTitle>
          <SheetDescription>
            {links
              ? "No email provider is set up. Share these invite links manually."
              : "Invites are tied to one email address and expire after 1 day."}
          </SheetDescription>
        </SheetHeader>
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
                <Field label="Emails" error={error}>
                  <Combobox
                    multiple
                    label="Emails"
                    placeholder="email@example.com, email2@example.com..."
                    emptyText="Type an email address and press Enter"
                    options={emails.map((email) => ({ value: email, label: email }))}
                    value={emails}
                    invalid={Boolean(error)}
                    onChange={(next) => {
                      setEmails(next);
                      setError(undefined);
                    }}
                    onCreate={(query) => {
                      const values = parseEmailList([query]);
                      const invalid = values.find((value) => !isValidEmail(value));
                      if (invalid) {
                        setError(`${invalid} is not a valid email`);
                        return;
                      }
                      setEmails((current) => [...new Set([...current, ...values])]);
                      setError(undefined);
                    }}
                  />
                </Field>
                <Field label="Assign organization role">
                  <Select
                    label="Assign organization role"
                    value={role ?? defaultRole}
                    onChange={setRole}
                    options={roleOptions(orgRoles)}
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
                    <Select
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
                  Add member
                </Button>
              </>
            )}
          </Inline>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
