import { Knex } from "knex";

import { TProjectPermission } from "@app/lib/types";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";

import { TCertificateAuthorityCrossSignedCertDALFactory } from "./certificate-authority-cross-signed-cert-dal";

export type TImportCaCrossSignedCertDTO = {
  caId: string;
  certificate: string;
  certificateChain: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetCaCrossSignedCertDTO = {
  caId: string;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteCaCrossSignedCertDTO = {
  caId: string;
} & Omit<TProjectPermission, "projectId">;

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
