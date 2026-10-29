import { Field, FieldContent, FieldDescription, FieldLabel, Input } from "@app/components/v3";
import {
  TAutoApprovalInputDetails,
  TAutoApprovalInputValue
} from "@app/hooks/api/approvalPolicies";

export const getInputKey = (input: { connectionId: string; subject: string }) =>
  `${input.connectionId}:${input.subject}`;

export const toAutoApprovalInputValues = (
  inputs: TAutoApprovalInputDetails[],
  values: Record<string, string>
): TAutoApprovalInputValue[] =>
  inputs
    .map((input) => ({
      connectionId: input.connectionId,
      subject: input.subject,
      value: values[getInputKey(input)]?.trim() ?? ""
    }))
    .filter((entry) => entry.value);

type Props = {
  inputs: TAutoApprovalInputDetails[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
};

export const AutoApprovalRequestInputs = ({ inputs, values, onChange }: Props) => (
  <>
    {inputs.map((input) => {
      const key = getInputKey(input);
      // Connections can ask for the same kind of record, and only the connection tells them apart
      const isAmbiguous = inputs.filter((other) => other.label === input.label).length > 1;
      return (
        <Field key={key}>
          <FieldLabel htmlFor={`auto-approval-${key}`}>
            {input.label}
            {isAmbiguous && ` from ${input.connectionName}`}{" "}
            <span className="font-normal text-muted">(optional)</span>
          </FieldLabel>
          <FieldContent>
            <Input
              id={`auto-approval-${key}`}
              value={values[key] ?? ""}
              onChange={(e) => onChange({ ...values, [key]: e.target.value })}
              placeholder={input.placeholder}
              maxLength={2048}
            />
            <FieldDescription>
              Requests are approved instantly when the linked record passes this folder&apos;s
              auto-approval rules.
            </FieldDescription>
          </FieldContent>
        </Field>
      );
    })}
  </>
);
