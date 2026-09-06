import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
  RadioGroup,
  RadioGroupItem
} from "@app/components/v3";
import { AGENT_VAULT_PRODUCT_ROLE_OPTIONS } from "@app/helpers/roles";

type Props = {
  value: string;
  onChange: (role: string) => void;
  /** Distinguishes the inputs when more than one of these is mounted. */
  idPrefix: string;
};

export const ProductRoleField = ({ value, onChange, idPrefix }: Props) => (
  <RadioGroup value={value} onValueChange={onChange}>
    {AGENT_VAULT_PRODUCT_ROLE_OPTIONS.map((role) => {
      const id = `${idPrefix}-${role.value}`;

      return (
        <FieldLabel key={role.value} htmlFor={id} variant="av">
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>{role.label}</FieldTitle>
              <FieldDescription>{role.description}</FieldDescription>
            </FieldContent>
            <RadioGroupItem id={id} value={role.value} />
          </Field>
        </FieldLabel>
      );
    })}
  </RadioGroup>
);
