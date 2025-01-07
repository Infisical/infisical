import { CaCrlsTable } from "./CaCrlsTable";

type Props = {
  caId: string;
};

export const CaCrlsSection = ({ caId }: Props) => {
  return (
    <div className="mt-4 w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">
          CA Certificate Revocation Lists (CRLs)
        </h3>
      </div>
      <div className="py-4">
        <CaCrlsTable caId={caId} />
      </div>
    </div>
  );
};
