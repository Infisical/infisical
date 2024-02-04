import jsrp from "jsrp";

export const generateSrpServerKey = async (salt: string, verifier: string) => {
  // eslint-disable-next-line new-cap
  const server = new jsrp.server();
  await new Promise((resolve) => {
    server.init({ salt, verifier }, () => resolve(null));
  });
  return { pubKey: server.getPublicKey(), privateKey: server.getPrivateKey() };
};

export const srpCheckClientProof = async (
  salt: string,
  verifier: string,
  serverPrivateKey: string,
  clientPublicKey: string,
  clientProof: string
) => {
  // eslint-disable-next-line new-cap
  const server = new jsrp.server();
  await new Promise((resolve) => {
    server.init({ salt, verifier, b: serverPrivateKey }, () => resolve(null));
  });
  server.setClientPublicKey(clientPublicKey);
  return server.checkClientProof(clientProof);
};
