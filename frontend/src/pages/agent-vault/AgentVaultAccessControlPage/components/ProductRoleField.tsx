import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
  RadioGroup,
  RadioGroupItem
} from "@app/components/v3";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

// Admin and Member are the only slugs Agent Vault writes: every other role resolves to the member
// set, so offering one would promise less access than it grants.
const ROLES = [
  {
    slug: ProjectMembershipRole.Admin,
    title: "Admin",
    description: "Manage bundles, connections, proxies and who else has access."
  },
  {
    slug: ProjectMembershipRole.Member,
    title: "Member",
    description: "Mint sessions over the access bundles they are granted, and nothing else."
  }
];

type Props = {
  value: string;
  onChange: (role: string) => void;
  /** Distinguishes the inputs when more than one of these is mounted. */
  idPrefix: string;
};

export const ProductRoleField = ({ value, onChange, idPrefix }: Props) => (
  <RadioGroup value={value} onValueChange={onChange}>
    {ROLES.map((role) => {
      const id = `${idPrefix}-${role.slug}`;

      return (
        <FieldLabel key={role.slug} htmlFor={id} variant="av">
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>{role.title}</FieldTitle>
              <FieldDescription>{role.description}</FieldDescription>
            </FieldContent>
            <RadioGroupItem id={id} value={role.slug} />
          </Field>
        </FieldLabel>
      );
    })}
  </RadioGroup>
);
