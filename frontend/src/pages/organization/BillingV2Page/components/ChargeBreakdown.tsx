import { ReactNode } from "react";
import { InfoIcon } from "lucide-react";

import { Alert, AlertDescription } from "@app/components/v3";

import { fmtMoney } from "../billing-v2-format";

type Props = {
  // This change's own cost (dollars).
  prorationAmount: number;
  // Earlier unbilled mid-cycle changes an invoice-now apply settles now (signed: positive = pending
  // charges, negative = a credit).
  additionalCharges: number;
  // What actually hits the card = prorationAmount + additionalCharges (signed).
  totalDueNow: number;
};

// Sign-aware disclosure of what settles on top of this change when applying invoice-now. The earlier
// changes can be pending charges (positive) or a credit (negative), and the net can even be a credit
// (nothing charged now, the balance carried to future invoices). Renders nothing when there's nothing
// extra to settle.
export const ChargeBreakdown = ({ prorationAmount, additionalCharges, totalDueNow }: Props) => {
  if (additionalCharges === 0) {
    return null;
  }

  let body: ReactNode;
  if (totalDueNow < 0) {
    // Net credit: nothing is charged now and the remaining credit rolls to future invoices.
    body = (
      <>
        You&apos;ll be charged <span className="font-medium">$0</span> now. This change costs{" "}
        {fmtMoney(prorationAmount, 2)}, and a{" "}
        <span className="font-medium">{fmtMoney(Math.abs(totalDueNow), 2)} credit</span> will be
        applied to your future invoices.
      </>
    );
  } else if (additionalCharges < 0) {
    // Still due now, but earlier changes contribute a credit that reduces the charge.
    body = (
      <>
        You&apos;ll be charged <span className="font-medium">{fmtMoney(totalDueNow, 2)}</span> now:{" "}
        {fmtMoney(prorationAmount, 2)} for this change, and a credit of{" "}
        {fmtMoney(Math.abs(additionalCharges), 2)} from earlier changes will be applied.
      </>
    );
  } else {
    body = (
      <>
        You&apos;ll be charged <span className="font-medium">{fmtMoney(totalDueNow, 2)}</span> now:{" "}
        {fmtMoney(prorationAmount, 2)} for this change, plus {fmtMoney(additionalCharges, 2)} in
        pending charges from earlier changes that haven&apos;t been billed yet.
      </>
    );
  }

  return (
    <Alert variant="info">
      <InfoIcon />
      <AlertDescription className="text-foreground">{body}</AlertDescription>
    </Alert>
  );
};
