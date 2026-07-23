import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle, Checkbox } from "@app/components/v3";

type Props = {
  acknowledged: boolean;
  onAcknowledgedChange: (value: boolean) => void;
};

// Consequence-forward confirmation shown before an annual commitment is purchased or increased. An
// annual commitment is paid upfront for the whole cycle, is non-cancellable, and cannot be reduced
// until renewal, so the customer must explicitly acknowledge the terms before Confirm unlocks. The
// copy is deliberately plain so the commitment they are making is unambiguous.
export const CommitmentTerms = ({ acknowledged, onAcknowledgedChange }: Props) => (
  <Alert variant="warning">
    <TriangleAlert />
    <AlertTitle>Review your annual commitment</AlertTitle>
    <AlertDescription className="flex flex-col gap-2 text-foreground">
      <span>
        An annual commitment locks in your rate for the full billing year. Please read this before
        you confirm:
      </span>
      <ul className="flex list-disc flex-col gap-1 pl-4 text-muted">
        <li>
          <span className="font-medium text-foreground">Paid upfront.</span> You are billed today
          for the entire year&apos;s committed units, not month by month.
        </li>
        <li>
          <span className="font-medium text-foreground">Increase any time.</span> You can raise your
          commitment mid cycle; the added units are prorated and charged immediately.
        </li>
        <li>
          <span className="font-medium text-foreground">No reductions mid cycle.</span> Committed
          units cannot be lowered until the final window before your renewal.
        </li>
        <li>
          <span className="font-medium text-foreground">Not cancellable.</span> The commitment runs
          to the end of the billing cycle and cannot be cancelled early.
        </li>
      </ul>
      <span>Usage above your commitment is billed monthly at the on-demand rate.</span>
      <div className="mt-1 flex items-start gap-2.5">
        <Checkbox
          id="commitment-ack"
          variant="warning"
          isChecked={acknowledged}
          onCheckedChange={(value) => onAcknowledgedChange(value === true)}
          className="mt-0.5"
        />
        <span className="text-xs">
          I understand this annual commitment is paid upfront, is not cancellable, and cannot be
          reduced until my renewal.
        </span>
      </div>
    </AlertDescription>
  </Alert>
);
