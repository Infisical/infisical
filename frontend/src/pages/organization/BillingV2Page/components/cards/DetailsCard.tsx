import { ReactNode } from "react";
import { Building2 } from "lucide-react";

import { Button, Card, CardAction, CardContent, CardHeader, CardTitle } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { BillingV2Overview } from "@app/hooks/api";

import { formatAddressLines, taxTypeLabel } from "../../billing-v2-format";
import { CardEmpty } from "../shared";

type DetailsCardProps = {
  overview: BillingV2Overview;
  canManage: boolean;
  onEdit: () => void;
};

const DetailField = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <div className="mb-1 text-xs text-label">{label}</div>
    <div className="text-sm text-foreground">{children}</div>
  </div>
);

export const DetailsCard = ({ overview, canManage, onEdit }: DetailsCardProps) => {
  const addressLines = formatAddressLines(overview.billingDetails?.address ?? null);
  const taxIds = overview.billingDetails?.taxIds ?? [];
  const hasAddress = addressLines.length > 0;
  const hasTaxIds = taxIds.length > 0;
  const emptyDash = <span className="text-muted">—</span>;
  const name = overview.billingDetails?.name || emptyDash;
  const email = overview.billingDetails?.email || emptyDash;
  // Responsive (keyed off the card's own width via @container, not the viewport, since the sidebar
  // changes how much room the card has): stack to one column when narrow, then two, then three.
  // The third column is the tax ID, so it only appears when one is present.
  const gridCols = hasTaxIds
    ? "grid-cols-1 @lg:grid-cols-2 @3xl:grid-cols-3"
    : "grid-cols-1 @lg:grid-cols-2";

  const nameEmailFields = (
    <>
      <DetailField label="Billing Name">{name}</DetailField>
      <DetailField label="Billing Email">{email}</DetailField>
    </>
  );

  const taxIdField = hasTaxIds ? (
    <DetailField label="Tax ID">
      {taxIds.map((taxId) => (
        <div key={`${taxId.type}-${taxId.value}`}>
          {taxId.value} <span className="text-muted">({taxTypeLabel(taxId.type)})</span>
        </div>
      ))}
    </DetailField>
  ) : null;

  return (
    // h-full so it matches the payment card's height when they share a row.
    <Card className="h-full">
      <CardHeader>
        <CardTitle>
          <Building2 className="size-4 text-accent" />
          Billing Details
        </CardTitle>
        {canManage && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={onEdit}>
              Edit
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="@container">
        {overview.billingDetails ? (
          <div className={cn("grid gap-x-8 gap-y-5", gridCols)}>
            {hasAddress ? (
              <>
                <div className="flex flex-col gap-4">{nameEmailFields}</div>
                <DetailField label="Billing Address">
                  {addressLines.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </DetailField>
                {taxIdField}
              </>
            ) : (
              <>
                {nameEmailFields}
                {taxIdField}
              </>
            )}
          </div>
        ) : (
          <CardEmpty
            title="No billing details"
            description="Your billing name, email, and address will appear here once added."
          />
        )}
      </CardContent>
    </Card>
  );
};
