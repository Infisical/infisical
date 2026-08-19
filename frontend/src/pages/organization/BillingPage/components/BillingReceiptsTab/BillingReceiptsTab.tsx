import { InvoicesTable } from "./InvoicesTable";

export const BillingReceiptsTab = () => {
  return (
    <div className="mb-6 rounded-lg border border-border bg-card p-4">
      <h2 className="flex-1 text-xl font-medium text-foreground">Invoices</h2>
      <InvoicesTable />
    </div>
  );
};
