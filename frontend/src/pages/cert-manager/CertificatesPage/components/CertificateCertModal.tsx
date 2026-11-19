import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  PageLoader
} from "@app/components/v3";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionSub,
  useProjectPermission
} from "@app/context";
import { useGetCertBody } from "@app/hooks/api";
import { useGetCertBundle } from "@app/hooks/api/certificates/queries";
import { useGetPkiApplicationPermissions } from "@app/hooks/api/pkiApplications/queries";
import {
  PkiApplicationResourceActions,
  PkiApplicationResourceSub
} from "@app/hooks/api/pkiApplications/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { CertificateContent } from "./CertificateContent";

type Props = {
  popUp: UsePopUpState<["certificateCert"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["certificateCert"]>, state?: boolean) => void;
  applicationId?: string;
};

export const CertificateCertModal = ({ popUp, handlePopUpToggle, applicationId }: Props) => {
  const { permission } = useProjectPermission();

  const serialNumber =
    (popUp?.certificateCert?.data as { serialNumber: string })?.serialNumber || "";

  const canReadPrivateKeyAtProject = permission.can(
    ProjectPermissionCertificateActions.ReadPrivateKey,
    ProjectPermissionSub.Certificates
  );

  const { data: appPermissionData } = useGetPkiApplicationPermissions(applicationId ?? "");
  const canReadPrivateKeyAtApplication = Boolean(
    appPermissionData?.permission?.can(
      PkiApplicationResourceActions.ReadPrivateKey,
      PkiApplicationResourceSub.Certificates
    )
  );

  const canReadPrivateKey = canReadPrivateKeyAtProject || canReadPrivateKeyAtApplication;

  // Only attempt to fetch the bundle (which includes the private key) if the
  // generic permission check passes. This avoids unnecessary 403s.
  // With metadata-based RBAC conditions the generic check may be overly
  // optimistic, so we always fetch the cert body as a fallback.
  const { data: bundleData } = useGetCertBundle(canReadPrivateKey ? serialNumber : "");
  const { data: bodyData, isError } = useGetCertBody(serialNumber);

  // Prefer bundle data (cert + key) when available, otherwise fall back to
  // body data (cert only). This ensures the certificate is always shown even
  // when the bundle request is skipped or 403s.
  const data:
    | {
        certificate: string;
        certificateChain: string;
        serialNumber: string;
        privateKey?: string | null;
      }
    | undefined = bundleData ?? bodyData;

  return (
    <Dialog
      open={popUp?.certificateCert?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("certificateCert", isOpen);
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Export Certificate</DialogTitle>
          <DialogDescription>
            Copy or download the certificate and its key material.
          </DialogDescription>
        </DialogHeader>
        {data && (
          <CertificateContent
            serialNumber={data.serialNumber}
            certificate={data.certificate}
            certificateChain={data.certificateChain}
            privateKey={data.privateKey || undefined}
          />
        )}
        {!data && isError && (
          <p className="py-8 text-center text-sm text-danger">Failed to load certificate.</p>
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
