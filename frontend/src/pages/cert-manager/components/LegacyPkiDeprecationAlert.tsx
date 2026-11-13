import { TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@app/components/v3";
import { LEGACY_PKI_DEPRECATION_DATE, LegacyPkiResource } from "@app/const/legacyPkiDeprecation";

import { PkiDocsUrls } from "../pki-docs-urls";

type Props = {
  resource: LegacyPkiResource;
};

const RESOURCE_NOUN: Record<LegacyPkiResource, string> = {
  [LegacyPkiResource.CertificateTemplate]: "Certificate templates",
  [LegacyPkiResource.PkiSubscriber]: "Subscribers"
};

export const LegacyPkiDeprecationAlert = ({ resource }: Props) => (
  <Alert variant="warning">
    <TriangleAlertIcon />
    <AlertTitle>Move to certificate applications</AlertTitle>
    <AlertDescription className="inline">
      {RESOURCE_NOUN[resource]} are being removed on {LEGACY_PKI_DEPRECATION_DATE}. After that date,
      certificates can no longer be issued through them, and any client enrolled against them will
      stop receiving certificates. Certificates you have already issued stay valid.{" "}
      <a
        href={PkiDocsUrls.applications.overview}
        target="_blank"
        rel="noreferrer"
        className="inline underline hover:opacity-80"
      >
        Read about certificate applications
      </a>
      .
    </AlertDescription>
  </Alert>
);
