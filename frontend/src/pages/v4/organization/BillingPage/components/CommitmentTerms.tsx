import { Checkbox } from "@app/components/v4/ui/checkbox";

type Props = {
  acknowledged: boolean;
  onAcknowledgedChange: (value: boolean) => void;
};

// Acknowledgment gate before an annual commitment is purchased or increased. The commitment is paid
// upfront, non-cancellable, and cannot be reduced until renewal, so Confirm stays locked until the
// customer checks this.
export const CommitmentTerms = ({ acknowledged, onAcknowledgedChange }: Props) => (
  <Checkbox
    checked={acknowledged}
    onCheckedChange={(value) => onAcknowledgedChange(value === true)}
    label="Click here to confirm your purchase and agree to be invoiced as shown above, prorated through your current billing cycle, per your Infisical agreement."
  />
);
