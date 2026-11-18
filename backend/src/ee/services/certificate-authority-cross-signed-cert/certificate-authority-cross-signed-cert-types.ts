import { Knex } from "knex";

import { TActorInput } from "@app/lib/types";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";

import { TCertificateAuthorityCrossSignedCertDALFactory } from "./certificate-authority-cross-signed-cert-dal";

export type TImportCaCrossSignedCertDTO = {
  caId: string;
  certificate: string;
  certificateChain: string;
} & TActorInput;

export type TGetCaCrossSignedCertDTO = {
  caId: string;
} & TActorInput;

export type TDeleteCaCrossSignedCertDTO = {
  caId: string;
} & TActorInput;

export type TAssertCrossSignedCertsAllowSubCaDTO = {
  parentCaId: string;
  attachedCaId: string;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findMaxSubCaDepth">;
  certificateAuthorityCrossSignedCertDAL: Pick<
    TCertificateAuthorityCrossSignedCertDALFactory,
    "lockCaHierarchyAndFindUnexpired"
  >;
  tx: Knex;
};
