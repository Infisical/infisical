// import { faPlus } from "@fortawesome/free-solid-svg-icons";
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
// import { IconButton } from "@app/components/v2";
import { CaCertificatesTable } from "./CaCertificatesTable";

type Props = {
  caId: string;
};

export const CaCertificatesSection = ({ caId }: Props) => {
  return (
    <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">CA Certificates</h3>
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
