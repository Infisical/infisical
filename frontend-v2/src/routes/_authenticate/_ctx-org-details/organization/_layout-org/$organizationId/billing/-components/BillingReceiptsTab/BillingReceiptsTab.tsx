import { InvoicesTable } from "./InvoicesTable";

export const BillingReceiptsTab = () => {
  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <h2 className="flex-1 text-xl font-semibold text-white">Invoices</h2>
      <InvoicesTable />
    </div>
  );
};
