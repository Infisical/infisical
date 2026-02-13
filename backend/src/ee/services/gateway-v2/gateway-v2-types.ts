export type TGatewayV2ConnectionDetails = {
  relayHost: string;
  gateway: {
    clientCertificate: string;
    clientPrivateKey: string;
    serverCertificateChain: string;
  };
  relay: {
    clientCertificate: string;
    clientPrivateKey: string;
    serverCertificateChain: string;
  };
};
