import { CaCrlsTable } from "./CaCrlsTable";

type Props = {
  caId: string;
};

export const CaCrlsSection = ({ caId }: Props) => {
  return (
    <div className="border-mineshaft-600 bg-mineshaft-900 mt-4 w-full rounded-lg border p-4">
      <div className="border-mineshaft-400 flex items-center justify-between border-b pb-4">
        <h3 className="text-mineshaft-100 text-lg font-medium">
          CA Certificate Revocation Lists (CRLs)
        </h3>
      </div>
      <div className="py-4">
        <CaCrlsTable caId={caId} />
      </div>
    </div>
  );
};
