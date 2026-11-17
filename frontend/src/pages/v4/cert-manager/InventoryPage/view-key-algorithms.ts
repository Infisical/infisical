import { NON_PQC_KEY_ALGORITHMS, PQC_KEY_ALGORITHMS } from "@app/hooks/api/certificates/constants";

export const VIEW_KEY_ALGORITHMS: Partial<Record<string, readonly string[]>> = {
  "system-pqc": PQC_KEY_ALGORITHMS,
  "system-non-pqc": NON_PQC_KEY_ALGORITHMS
};
