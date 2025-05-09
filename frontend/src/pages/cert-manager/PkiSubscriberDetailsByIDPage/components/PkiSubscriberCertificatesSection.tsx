import { usePopUp } from "@app/hooks";
import { CertificateRevocationModal } from "@app/pages/cert-manager/CertificatesPage/components/CertificateRevocationModal";

import { PkiSubscriberCertificatesTable } from "./PkiSubscriberCertificatesTable";

type Props = {
  subscriberName: string;
};

export const PkiSubscriberCertificatesSection = ({ subscriberName }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["revokeCertificate"] as const);

  return (
    <div className="h-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">Certificates</h3>
      </div>
      <div className="py-4">
        <PkiSubscriberCertificatesTable
          subscriberName={subscriberName}
          handlePopUpOpen={handlePopUpOpen}
        />
      </div>
      <CertificateRevocationModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
    </div>
  );
};
