import { CaCertificatesTable } from "./CaCertificatesTable";

type Props = {
  caId: string;
};

export const CaCertificatesSection = ({ caId }: Props) => {
  return (
    <div className="border-mineshaft-600 bg-mineshaft-900 w-full rounded-lg border p-4">
      <div className="border-mineshaft-400 flex items-center justify-between border-b pb-4">
        <h3 className="text-mineshaft-100 text-lg font-medium">CA Certificates</h3>
        {/* <IconButton
          ariaLabel="copy icon"
          variant="plain"
          className="group relative"
          onClick={() => {
            // handlePopUpOpen("addIdentityToProject");
          }}
        >
          <FontAwesomeIcon icon={faPlus} />
        </IconButton> */}
      </div>
      <div className="py-4">
        <CaCertificatesTable caId={caId} />
      </div>
    </div>
  );
};
