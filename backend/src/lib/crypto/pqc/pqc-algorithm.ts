// eslint-disable-next-line import/no-extraneous-dependencies -- transitive dependency of @peculiar/x509
import { AlgorithmIdentifier } from "@peculiar/asn1-x509";
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive dependency of @peculiar/x509
import { container } from "tsyringe";

import { pqcNameToOid, pqcOidToName } from "./pqc-utils";

const diAlgorithm = "crypto.algorithm";

// Registers PQC OID mappings with @peculiar/x509's algorithm provider (tsyringe).
// Must use the real AlgorithmIdentifier class because @peculiar/asn1-schema requires decorated ASN.1 instances.
class PqcAlgorithm {
  // eslint-disable-next-line class-methods-use-this
  toAsnAlgorithm(alg: Algorithm): AlgorithmIdentifier | null {
    const oid = pqcNameToOid(alg.name);
    if (!oid) return null;

    // PQC algorithm identifiers have no parameters per RFC 9881
    return new AlgorithmIdentifier({ algorithm: oid });
  }

  // eslint-disable-next-line class-methods-use-this
  toWebAlgorithm(alg: AlgorithmIdentifier): Algorithm | null {
    const name = pqcOidToName(alg.algorithm);
    if (!name) return null;

    return { name } as Algorithm;
  }
}

export const registerPqcAlgorithms = () => {
  container.registerSingleton(diAlgorithm, PqcAlgorithm);
};
