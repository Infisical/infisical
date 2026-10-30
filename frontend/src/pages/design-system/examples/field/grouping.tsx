import { Checkbox } from "@app/components/v4/ui/checkbox";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet
} from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";

import { ExampleCell } from "../../example-presentation";

export default function Example() {
  return (
    <FieldGroup>
      <Field label="Description" optional>
        <Input placeholder="Purpose of this connection" />
      </Field>
      <Field label="Notifications" group description="Choose where to send local audit events.">
        <div className="space-y-3">
          <Checkbox label="Deployments" defaultChecked />
          <Checkbox label="Access changes" />
        </div>
      </Field>
      <FieldSeparator>Ownership</FieldSeparator>
      <ExampleCell align="stretch" label="legend">
        <FieldSet>
          <FieldLegend>Service ownership</FieldLegend>
          <Field label="Owner">
            <Input defaultValue="platform" />
          </Field>
        </FieldSet>
      </ExampleCell>
      <Field>
        <FieldLabel htmlFor="field-multiple">Change request</FieldLabel>
        <Input
          id="field-multiple"
          required
          minLength={12}
          aria-invalid="true"
          aria-describedby="field-multiple-error"
        />
        <FieldError
          id="field-multiple-error"
          errors={[
            { message: "Use at least 12 characters." },
            { message: "Enter a change reason." },
            { message: "Use at least 12 characters." }
          ]}
        />
      </Field>
    </FieldGroup>
  );
}
