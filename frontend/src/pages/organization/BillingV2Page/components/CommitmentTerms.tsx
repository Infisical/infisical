import { Checkbox } from "@app/components/v3";

type Props = {
  acknowledged: boolean;
  onAcknowledgedChange: (value: boolean) => void;
};

// Single acknowledgment gate shown before an annual commitment is purchased or increased. The
// commitment is paid upfront, non-cancellable, and cannot be reduced until renewal, so Confirm stays
// locked until the customer checks this.
export const CommitmentTerms = ({ acknowledged, onAcknowledgedChange }: Props) => (
  <div className="flex items-start gap-2.5">
    <Checkbox
      id="commitment-ack"
      isChecked={acknowledged}
      onCheckedChange={(value) => onAcknowledgedChange(value === true)}
    />
    <span className="text-xs text-muted">
      I agree to a 12-month term, billed today and non-refundable. The plan can be increased at any
      time; reductions take effect at renewal.
    </span>
  </div>
);
