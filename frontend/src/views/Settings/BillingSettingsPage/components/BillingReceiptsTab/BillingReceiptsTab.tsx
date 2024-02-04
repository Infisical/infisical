import { InvoicesTable } from "./InvoicesTable";

export const BillingReceiptsTab = () => {
    return (
        <div className="p-4 bg-mineshaft-900 mb-6 rounded-lg border border-mineshaft-600">
          <h2 className="text-xl font-semibold flex-1 text-white">Invoices</h2>
          <InvoicesTable />
        </div>
    );
}