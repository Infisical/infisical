import { RequestsTable } from "./RequestsTable";

export const RequestsSection = () => {
  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xl font-medium text-mineshaft-100">Approval Requests</p>
      </div>
      <RequestsTable />
    </div>
  );
};
