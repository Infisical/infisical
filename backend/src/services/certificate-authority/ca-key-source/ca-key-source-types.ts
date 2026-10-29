import { TCertificateAuthoritySecret } from "@app/db/schemas";
import { OrgServiceActor } from "@app/lib/types";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { CertKeyAlgorithm, CertSignatureAlgorithm } from "@app/services/certificate/certificate-types";
import { CertKeySource } from "@app/services/signer/signer-enums";

import { TCaSigner } from "../ca-signer";

export type TExternalCaKeySource = Exclude<CertKeySource, CertKeySource.Infisical>;

export type TExternalCaKeyInput = {
  hsmConnectorId?: string;
  appConnectionId?: string;
  region?: AWSRegion;
};

export type TExternalCaKeyReference = Pick<
  TCertificateAuthoritySecret,
  "hsmConnectorId" | "appConnectionId" | "externalKeyId" | "hsmKeyId" | "publicKeySpki"
>;

export type TCaKeyDetails = {
  hsmConnectorId?: string;
  hsmConnectorName?: string;
  hsmKeyLabel?: string;
  appConnectionId?: string;
  appConnectionName?: string;
  externalKeyId?: string;
  region?: string;
};

export type TExternalCaKeyProvider = {
  displayName: string;
  supportedKeyAlgorithms: readonly CertKeyAlgorithm[];
  assertCanUse: (args: { actor: OrgServiceActor; projectId: string; input: TExternalCaKeyInput }) => Promise<void>;
  createKey: (args: {
    projectId: string;
    caName: string;
    keyAlgorithm: CertKeyAlgorithm;
    input: TExternalCaKeyInput;
  }) => Promise<Partial<TExternalCaKeyReference>>;
  buildSigner: (args: {
    projectId: string;
    keyAlgorithm: CertKeyAlgorithm;
    reference: Partial<TExternalCaKeyReference>;
    signatureAlgorithm?: Algorithm;
  }) => Promise<TCaSigner>;
  describeKey: (args: { reference: Partial<TExternalCaKeyReference> }) => Promise<TCaKeyDetails>;
  prepareKeyRelease?: (args: { reference: Partial<TExternalCaKeyReference> }) => Promise<() => Promise<void>>;
  requiredSignatureAlgorithm?: (keyAlgorithm: CertKeyAlgorithm) => CertSignatureAlgorithm | undefined;
};
