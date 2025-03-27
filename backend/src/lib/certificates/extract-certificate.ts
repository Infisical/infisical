import { BadRequestError } from "../errors";

export const extractX509CertFromChain = (certificateChain: string): string[] => {
  if (!certificateChain) {
    throw new BadRequestError({
      message: "Certificate chain is empty or undefined"
    });
  }

  const certificates: string[] = [];
  let currentPosition = 0;
  const chainLength = certificateChain.length;

  while (currentPosition < chainLength) {
    // Find the start of a certificate
    const beginMarker = "-----BEGIN CERTIFICATE-----";
    const startIndex = certificateChain.indexOf(beginMarker, currentPosition);

    if (startIndex === -1) {
      break; // No more certificates found
    }

    // Find the end of the certificate
    const endMarker = "-----END CERTIFICATE-----";
    const endIndex = certificateChain.indexOf(endMarker, startIndex);

    if (endIndex === -1) {
      throw new BadRequestError({
        message: "Malformed certificate chain: Found BEGIN marker without matching END marker"
      });
    }

    // Extract the complete certificate including markers
    const completeEndIndex = endIndex + endMarker.length;
    const certificate = certificateChain.substring(startIndex, completeEndIndex);

    // Add the extracted certificate to our results
    certificates.push(certificate);

    // Move position to after this certificate
    currentPosition = completeEndIndex;
  }

  if (certificates.length === 0) {
    throw new BadRequestError({
      message: "No valid certificates found in the chain"
    });
  }

  return certificates;
};
