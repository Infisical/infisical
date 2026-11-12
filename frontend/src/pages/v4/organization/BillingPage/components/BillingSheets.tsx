import type { ReactNode } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Detail, DetailLabel, DetailValue } from "@infisical/cipher/ui/detail";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Stack } from "@infisical/cipher/ui/layout";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@infisical/cipher/ui/table";

import type { BillingOverview } from "@app/hooks/api/billing/types";

import { fmtMoneyCents, formatAddressLines, taxTypeLabel } from "../billing-format";

import styles from "./billing.module.css";

const BillingSheet = ({
  isOpen,
  onOpenChange,
  title,
  description,
  action,
  children
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) => (
  <Sheet open={isOpen} onOpenChange={onOpenChange}>
    <SheetContent>
      <SheetHeader>
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>{description}</SheetDescription>
      </SheetHeader>
      <SheetBody>{children}</SheetBody>
      {action && <SheetFooter>{action}</SheetFooter>}
    </SheetContent>
  </Sheet>
);

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <Detail>
    <DetailLabel>{label}</DetailLabel>
    <DetailValue>{children}</DetailValue>
  </Detail>
);

type SheetProps = {
  overview: BillingOverview;
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
    title="Payment method"
    description="The card charged for your subscription and usage."
    action={
      canManage && (
        <Button iconRight="external" onClick={onUpdate}>
          {overview.payment ? "Update payment method" : "Add payment method"}
        </Button>
      )
    }
  >
    {overview.payment ? (
      <Stack gap={16}>
        <Field label="Card">
          {overview.payment.brand.toUpperCase()} ending in {overview.payment.last4}
        </Field>
        <Field label="Expires">
          {String(overview.payment.expMonth).padStart(2, "0")} /{" "}
          {String(overview.payment.expYear).slice(-2)}
        </Field>
      </Stack>
    ) : (
      <EmptyState
        size="sm"
        icon="lock"
        title="No payment method"
        description="You haven't added a payment method yet."
      />
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
  const none = <span className={styles.secondary}>None</span>;

  return (
    <BillingSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Billing details"
      description="The name, email and address shown on your invoices."
      action={
        canManage && (
          <Button iconRight="external" onClick={onEdit}>
            Edit billing details
          </Button>
        )
      }
    >
      {details ? (
        <Stack gap={16}>
          <Field label="Billing name">{details.name || none}</Field>
          <Field label="Billing email">{details.email || none}</Field>
          {addressLines.length > 0 && (
            <Field label="Billing address">
              {addressLines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </Field>
          )}
          {details.taxIds.length > 0 && (
            <Field label="Tax ID">
              {details.taxIds.map((taxId) => (
                <div key={`${taxId.type}-${taxId.value}`}>
                  {taxId.value}{" "}
                  <span className={styles.secondary}>({taxTypeLabel(taxId.type)})</span>
                </div>
              ))}
            </Field>
          )}
        </Stack>
      ) : (
        <EmptyState
          size="sm"
          title="No billing details"
          description="Your billing name, email and address will appear here once added."
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
      <EmptyState
        size="sm"
        icon="file"
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
            <TableHead>
              <span className={styles.truncate}>Invoice</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {overview.invoices.map((inv) => {
            let status = <Badge tone="bad">Unpaid</Badge>;
            if (inv.amount < 0) status = <Badge tone="soft">Credit</Badge>;
            else if (inv.paid) status = <Badge tone="ok">Paid</Badge>;
            return (
              <TableRow key={inv.id}>
                <TableCell>{inv.date}</TableCell>
                <TableCell className={styles.numeric}>{fmtMoneyCents(inv.amount)}</TableCell>
                <TableCell>{status}</TableCell>
                <TableCell>
                  {inv.pdfUrl ? (
                    <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer">
                      PDF
                    </a>
                  ) : (
                    <span className={styles.secondary}>None</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    )}
  </BillingSheet>
);
