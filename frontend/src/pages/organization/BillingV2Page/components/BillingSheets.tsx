import { ReactNode } from "react";
import { ExternalLink } from "lucide-react";

import {
  Badge,
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { BillingV2Overview } from "@app/hooks/api";

import { fmtMoneyCents, formatAddressLines, taxTypeLabel } from "../billing-v2-format";
import { CardEmpty } from "./shared";

type BillingSheetProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
};

const BillingSheet = ({
  isOpen,
  onOpenChange,
  title,
  description,
  action,
  children
}: BillingSheetProps) => (
  <Sheet open={isOpen} onOpenChange={onOpenChange}>
    <SheetContent>
      <SheetHeader>
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>{description}</SheetDescription>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">{children}</div>
      {action && <SheetFooter>{action}</SheetFooter>}
    </SheetContent>
  </Sheet>
);

const DetailField = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <div className="mb-1 text-xs text-label">{label}</div>
    <div className="text-sm text-foreground">{children}</div>
  </div>
);

type SheetProps = {
  overview: BillingV2Overview;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const PaymentSheet = ({
  overview,
  isOpen,
  onOpenChange,
  canManage,
  onUpdate
}: SheetProps & { canManage: boolean; onUpdate: () => void }) => (
  <BillingSheet
    isOpen={isOpen}
    onOpenChange={onOpenChange}
    title="Payment Method"
    description="The card charged for your subscription and usage."
    action={
      canManage && (
        <Button variant="outline" onClick={onUpdate}>
          {overview.payment ? "Update Payment Method" : "Add Payment Method"}
        </Button>
      )
    }
  >
    {overview.payment ? (
      <>
        <DetailField label="Card">
          {overview.payment.brand.toUpperCase()} ending in {overview.payment.last4}
        </DetailField>
        <DetailField label="Expires">
          {String(overview.payment.expMonth).padStart(2, "0")} /{" "}
          {String(overview.payment.expYear).slice(-2)}
        </DetailField>
      </>
    ) : (
      <CardEmpty title="No payment method" description="You haven't added a payment method yet." />
    )}
  </BillingSheet>
);

export const DetailsSheet = ({
  overview,
  isOpen,
  onOpenChange,
  canManage,
  onEdit
}: SheetProps & { canManage: boolean; onEdit: () => void }) => {
  const details = overview.billingDetails;
  const addressLines = formatAddressLines(details?.address ?? null);
  const emptyDash = <span className="text-muted">—</span>;

  return (
    <BillingSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Billing Details"
      description="The name, email, and address shown on your invoices."
      action={
        canManage && (
          <Button variant="outline" onClick={onEdit}>
            Edit Billing Details
          </Button>
        )
      }
    >
      {details ? (
        <>
          <DetailField label="Billing Name">{details.name || emptyDash}</DetailField>
          <DetailField label="Billing Email">{details.email || emptyDash}</DetailField>
          {addressLines.length > 0 && (
            <DetailField label="Billing Address">
              {addressLines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </DetailField>
          )}
          {details.taxIds.length > 0 && (
            <DetailField label="Tax ID">
              {details.taxIds.map((taxId) => (
                <div key={`${taxId.type}-${taxId.value}`}>
                  {taxId.value} <span className="text-muted">({taxTypeLabel(taxId.type)})</span>
                </div>
              ))}
            </DetailField>
          )}
        </>
      ) : (
        <CardEmpty
          title="No billing details"
          description="Your billing name, email, and address will appear here once added."
        />
      )}
    </BillingSheet>
  );
};

export const InvoicesSheet = ({ overview, isOpen, onOpenChange }: SheetProps) => (
  <BillingSheet
    isOpen={isOpen}
    onOpenChange={onOpenChange}
    title="Invoices"
    description="Every invoice issued for this organization."
  >
    {overview.invoices.length === 0 ? (
      <CardEmpty
        title="No invoices yet"
        description="Your first invoice appears after your next billing date."
      />
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {overview.invoices.map((inv) => (
            <TableRow key={inv.id}>
              <TableCell>{inv.date}</TableCell>
              <TableCell className="tabular-nums">{fmtMoneyCents(inv.amount)}</TableCell>
              <TableCell>
                {inv.paid ? (
                  <Badge variant="success">Paid</Badge>
                ) : (
                  <Badge variant="danger">Unpaid</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                {inv.pdfUrl ? (
                  <a
                    className="inline-flex items-center gap-1.5 text-xs text-muted hover:underline"
                    href={inv.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="size-3.5" />
                    PDF
                  </a>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )}
  </BillingSheet>
);
