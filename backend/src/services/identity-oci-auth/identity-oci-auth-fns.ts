import RE2 from "re2";

// OCI Signature v1 user principals sign with keyId="<tenancy-ocid>/<user-ocid>/<key-fingerprint>".
const OCI_SIGNATURE_KEY_ID_REGEX = new RE2('keyId="([^"]*)"', "i");

export const getOciSignerUserOcid = (authorizationHeader: string): string | null => {
  const match = OCI_SIGNATURE_KEY_ID_REGEX.exec(authorizationHeader);
  if (!match) return null;

  const segments = match[1].split("/");
  if (segments.length !== 3) return null;

  const [tenancyOcid, userOcid, fingerprint] = segments;
  if (!tenancyOcid || !userOcid || !fingerprint) return null;

  return userOcid;
};
