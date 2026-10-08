import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  PageLoader
} from "@app/components/v3";
import { useGetCaCert } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { CertificateContent } from "../../CertificatesPage/components/CertificateContent";

type Props = {
  popUp: UsePopUpState<["caCert"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["caCert"]>, state?: boolean) => void;
};

export const CaCertModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { data, isError } = useGetCaCert((popUp?.caCert?.data as { caId: string })?.caId || "");
  return (
    <Dialog
      open={popUp?.caCert?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("caCert", isOpen);
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>CA Certificate</DialogTitle>
          <DialogDescription>Copy or download the CA certificate and its chain.</DialogDescription>
        </DialogHeader>
        {data && (
          <CertificateContent
            serialNumber={data.serialNumber}
            certificate={data.certificate}
            certificateChain={data.certificateChain}
          />
        )}
        {!data && isError && (
          <p className="py-8 text-center text-sm text-danger">Failed to load CA certificate.</p>
        )}
        {!data && !isError && (
          <div className="py-8">
            <PageLoader />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
