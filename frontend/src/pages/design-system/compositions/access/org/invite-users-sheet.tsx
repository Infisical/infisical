import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { Combobox } from "@app/components/v4/ui/combobox";
import { Field } from "@app/components/v4/ui/field";
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

import { useAccess } from "../context";
import type { OrgMember } from "../model";

const MAX_INVITE_EMAILS = 100;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const products = [
  { value: "none", label: "None" },
  { value: "secret-manager", label: "Secrets Management" },
  { value: "cert-manager", label: "Certificate Manager" },
  { value: "kms", label: "KMS" },
  { value: "ssh", label: "SSH" },
  { value: "pam", label: "PAM" }
];
export const productProjects: Record<string, { value: string; label: string }[]> = {
  "secret-manager": [
    { value: "payments-api", label: "payments-api" },
    { value: "web-dashboard", label: "web-dashboard" },
    { value: "platform-core", label: "platform-core" }
  ],
  "cert-manager": [{ value: "internal-pki", label: "internal-pki" }],
  kms: [{ value: "kms-keys", label: "kms-keys" }],
  ssh: [],
  pam: []
};
const singleton = ["pam"];
const builtInProjectRoles = [
  { value: "admin", label: "Admin", description: "Full administrative access over a project" },
  { value: "member", label: "Member", description: "Limited read/write role in a project" },
  { value: "viewer", label: "Viewer", description: "Only read role in a project" },
  {
    value: "no-access",
    label: "No Access",
    description: "No access to any resources in the project"
  }
];

export const InviteUsersSheet = ({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { data, update, saved } = useAccess();
  const [emails, setEmails] = useState<string[]>(() =>
    open ? ["nina@acme.dev", "raj@acme.dev"] : []
  );
  const [role, setRole] = useState(data.defaultOrgRole);
  const [product, setProduct] = useState("none");
  const [projects, setProjects] = useState<string[]>([]);
  const [projectRole, setProjectRole] = useState("member");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const reset = () => {
    setEmails([]);
    setRole(data.defaultOrgRole);
    setProduct("none");
    setProjects([]);
    setProjectRole("member");
    setError(undefined);
  };

  const submit = () => {
    if (!emails.length) {
      setError("Enter at least one email");
      return;
    }
    if (emails.length > MAX_INVITE_EMAILS) {
      setError(`You can invite up to ${MAX_INVITE_EMAILS} emails at once`);
      return;
    }
    setPending(true);
    window.setTimeout(() => {
      const existing = new Set(data.orgMembers.map((member) => member.user.email));
      const invited: OrgMember[] = emails
        .filter((email) => !existing.has(email))
        .map((email) => ({
          user: { id: `u-${email}`, email, username: email },
          membership: {
            id: `m-${email}`,
            role,
            isActive: true,
            status: "invited",
            createdAt: "Oct 30, 2026"
          },
          groups: []
        }));
      update((current) => ({ ...current, orgMembers: [...current.orgMembers, ...invited] }));
      setPending(false);
      saved(`Successfully invited user${emails.length > 1 ? "s" : ""} to the organization.`);
      reset();
      onOpenChange(false);
    }, 500);
  };

  const isSingleton = singleton.includes(product);
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <SheetContent onOpenAutoFocus={(event) => event.preventDefault()}>
        <SheetHeader>
          <SheetTitle>Invite others to Acme Corp</SheetTitle>
          <SheetDescription>
            An invite is specific to an email address and expires after 1 day.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
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
                    const values = query
                      .split(/[s,]+/)
                      .map((value) => value.trim())
                      .filter(Boolean);
                    const invalid = values.find((value) => !EMAIL.test(value));
                    if (invalid) {
                      setError(`${invalid} is not a valid email`);
                      return;
                    }
                    setEmails((current) => [...new Set([...current, ...values])]);
                    setError(undefined);
                  }}
                />
              </Field>
              <Field
                label="Assign organization role"
                description="Select which organization role you want to assign to the user."
              >
                <Select
                  label="Assign organization role"
                  value={role}
                  onChange={setRole}
                  options={data.orgRoles.map((item) => ({
                    value: item.slug,
                    label: item.name,
                    description: item.description ?? "No description"
                  }))}
                />
              </Field>
              <Field
                label="Assign users to a product"
                optional
                description="Select which product to grant the users access to."
              >
                <Select
                  label="Assign users to a product"
                  placeholder="Select a product..."
                  value={product}
                  onChange={(value) => {
                    setProduct(value);
                    setProjects([]);
                  }}
                  options={products}
                />
              </Field>
              {product !== "none" && !isSingleton && (
                <Field label="Assign users to projects" optional>
                  <MultiSelect
                    label="Assign users to projects"
                    placeholder="Select projects..."
                    searchable
                    options={productProjects[product] ?? []}
                    value={projects}
                    onChange={setProjects}
                  />
                </Field>
              )}
              {product !== "none" && (
                <Field
                  label={isSingleton ? "Product role" : "Project role"}
                  description={
                    isSingleton
                      ? "Select which role to assign to the users for this product."
                      : "Select which role to assign to the users in the selected projects. When multiple projects are selected, only built-in roles are available. You can assign users to additional projects after they've been invited."
                  }
                >
                  <Select
                    label={isSingleton ? "Product role" : "Project role"}
                    value={projectRole}
                    onChange={setProjectRole}
                    options={builtInProjectRoles}
                  />
                </Field>
              )}
            </Stack>
          </form>
        </SheetBody>
        <SheetFooter>
          <Inline gap={8} justify="end">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="invite-users" loading={pending}>
              Add member
            </Button>
          </Inline>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
