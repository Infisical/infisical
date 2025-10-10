import { InvoicesTable } from "./InvoicesTable";

export const BillingReceiptsTab = () => {
  return (
    <div className="border-mineshaft-600 bg-mineshaft-900 mb-6 rounded-lg border p-4">
      <h2 className="flex-1 text-xl font-medium text-white">Invoices</h2>
      <InvoicesTable />
    </div>
  );
};
