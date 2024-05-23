import * as x509 from "@peculiar/x509";
import crypto, { KeyObject } from "crypto";

import { BadRequestError } from "@app/lib/errors";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TCertificateAuthorityCertDALFactory } from "./certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "./certificate-authority-dal";
import { TCertificateAuthoritySkDALFactory } from "./certificate-authority-sk-dal";
import {
  // TIssueCertFromCaDTO,
  CAType,
  TCreateCaDTO,
  TGetCaCertDTO,
  TGetCaCsrDTO
} from "./certificate-authority-types";

type TCertificateAuthorityServiceFactoryDep = {
  // TODO: Pick
  certificateAuthorityDAL: TCertificateAuthorityDALFactory;
  certificateAuthorityCertDAL: TCertificateAuthorityCertDALFactory;
  certificateAuthoritySkDAL: TCertificateAuthoritySkDALFactory;
  projectDAL: TProjectDALFactory;
};

export type TCertificateAuthorityServiceFactory = ReturnType<typeof certificateAuthorityServiceFactory>;

type DNParts = {
  commonName?: string;
  organization?: string;
  ou?: string;
  country?: string;
  province?: string;
  locality?: string;
};

function createDistinguishedName(parts: DNParts) {
  const dnParts = [];
  if (parts.country) dnParts.push(`C=${parts.country}`);
  if (parts.organization) dnParts.push(`O=${parts.organization}`);
  if (parts.ou) dnParts.push(`OU=${parts.ou}`);
  if (parts.province) dnParts.push(`ST=${parts.province}`);
  if (parts.commonName) dnParts.push(`CN=${parts.commonName}`);
  if (parts.locality) dnParts.push(`L=${parts.locality}`);
  return dnParts.join(", ");
}

export const certificateAuthorityServiceFactory = ({
  certificateAuthorityDAL,
  certificateAuthorityCertDAL,
  certificateAuthoritySkDAL,
  projectDAL
}: TCertificateAuthorityServiceFactoryDep) => {
  /**
   * Generates a new root or intermediate CA
   * @param param0
   * @returns
   */
  const createCa = async ({
    projectSlug,
    type,
    commonName,
    organization,
    ou,
    country,
    province,
    locality,
    // actorId,
    // actorAuthMethod,
    // actor,
    actorOrgId
  }: TCreateCaDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new BadRequestError({ message: "Project not found" });

    const dn = createDistinguishedName({
      commonName,
      organization,
      ou,
      country,
      province,
      locality
    });

    const alg = {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
      publicExponent: new Uint8Array([1, 0, 1]),
      modulusLength: 2048
    };
    const keys = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]);

    // https://nodejs.org/api/crypto.html#static-method-keyobjectfromkey
    const skObj = KeyObject.from(keys.privateKey);
    const sk = skObj.export({ format: "pem", type: "pkcs8" }) as string;
    const pkObj = KeyObject.from(keys.publicKey);
    const pk = pkObj.export({ format: "pem", type: "spki" }) as string;

    const newCa = await certificateAuthorityDAL.transaction(async (tx) => {
      const ca = await certificateAuthorityDAL.create(
        {
          projectId: project.id,
          type,
          dn
        },
        tx
      );

      if (type === CAType.ROOT) {
        // note: self-signed cert only applicable for root CA
        const cert = await x509.X509CertificateGenerator.createSelfSigned({
          name: dn,
          notBefore: new Date("2020/01/01"),
          notAfter: new Date("2020/01/02"),
          signingAlgorithm: alg,
          keys,
          extensions: [
            new x509.BasicConstraintsExtension(true, 2, true),
            new x509.ExtendedKeyUsageExtension(["1.2.3.4.5.6.7", "2.3.4.5.6.7.8"], true),
            // eslint-disable-next-line no-bitwise
            new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
            await x509.SubjectKeyIdentifierExtension.create(keys.publicKey)
          ]
        });
        const certificate = cert.toString("pem");
        await certificateAuthorityCertDAL.create(
          {
            caId: ca.id,
            certificate, // TODO: encrypt
            certificateChain: "" // TODO: encrypt
          },
          tx
        );
      }

      await certificateAuthoritySkDAL.create(
        {
          caId: ca.id,
          pk, // TODO: encrypt
          sk // TODO: encrypt
        },
        tx
      );

      return ca;
    });

    return newCa;
  };

  /**
   * Generates a CSR for a CA
   */
  const getCaCsr = async ({ caId }: TGetCaCsrDTO) => {
    const ca = await certificateAuthorityDAL.findById(caId);
    if (!ca) throw new BadRequestError({ message: "CA not found" });
    // TODO: permissioning

    const caCert = await certificateAuthorityCertDAL.findOne({ caId: ca.id });
    const caKeys = await certificateAuthoritySkDAL.findOne({ caId: ca.id });

    const alg = {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
      publicExponent: new Uint8Array([1, 0, 1]),
      modulusLength: 2048
    };

    const skObj = crypto.createPrivateKey({ key: caKeys.sk, format: "pem", type: "pkcs8" });
    const pkObj = crypto.createPublicKey({ key: caKeys.pk, format: "pem", type: "spki" });

    const sk = await crypto.subtle.importKey("pkcs8", skObj.export({ format: "der", type: "pkcs8" }), alg, true, [
      "sign"
    ]);
    const pk = await crypto.subtle.importKey("spki", pkObj.export({ format: "der", type: "spki" }), alg, true, [
      "verify"
    ]);

    const cert = new x509.X509Certificate(caCert.certificate);

    const csr = await x509.Pkcs10CertificateRequestGenerator.create({
      name: cert.subject || ca.dn,
      keys: { privateKey: sk, publicKey: pk },
      signingAlgorithm: alg,
      extensions: [
        // eslint-disable-next-line no-bitwise
        new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment)
      ],
      attributes: [new x509.ChallengePasswordAttribute("password")]
    });

    return csr.toString("base64");
  };

  /**
   * Return certificate and certificate chain for CA
   */
  const getCaCert = async ({ caId }: TGetCaCertDTO) => {
    const ca = await certificateAuthorityDAL.findById(caId);
    if (!ca) throw new BadRequestError({ message: "CA not found" });
    // TODO: permissioning

    const caCert = await certificateAuthorityCertDAL.findOne({ caId: ca.id });

    return {
      certificate: caCert.certificate,
      certificateChain: caCert.certificateChain
    };
  };

  /**
   * Issue new certificate
   */
  const issueCertFromCa = async () => {
    // WIP: parse publicKey from CSR
    // const csrArrayBuffer = Uint8Array.from(atob(csr), (c) => c.charCodeAt(0));
    // const csrR = new x509.Pkcs10CertificateRequest(csrArrayBuffer);

    // const ca = await certificateAuthorityDAL.findById(caId);
    // if (!ca) throw new BadRequestError({ message: "CA not found" });
    // // TODO: permissioning

    // const alg = {
    //   name: "RSASSA-PKCS1-v1_5",
    //   hash: "SHA-256",
    //   publicExponent: new Uint8Array([1, 0, 1]),
    //   modulusLength: 2048
    // };

    // const caCert = await certificateAuthorityCertDAL.findOne({ caId: ca.id });
    // const caKeys = await certificateAuthoritySkDAL.findOne({ caId: ca.id });

    // const skObj = crypto.createPrivateKey({ key: caKeys.sk, format: "pem", type: "pkcs8" });
    // const sk = await crypto.subtle.importKey("pkcs8", skObj.export({ format: "der", type: "pkcs8" }), alg, true, [
    //   "sign"
    // ]);

    // const cert = new x509.X509Certificate(caCert.certificate);

    // const leafCert = await x509.X509CertificateGenerator.create({
    //   // serialNumber: "03",
    //   subject: "CN=Leaf", // TODO: make dynamic
    //   issuer: cert.subject,
    //   notBefore: new Date(notBefore),
    //   notAfter: new Date(notAfter),
    //   signingKey: sk,
    //   publicKey: leafKeys.publicKey,
    //   signingAlgorithm: alg,
    //   extensions: [
    //     new x509.KeyUsagesExtension(x509.KeyUsageFlags.dataEncipherment, true),
    //     new x509.BasicConstraintsExtension(false),
    //     await x509.AuthorityKeyIdentifierExtension.create(cert, false),
    //     await x509.SubjectKeyIdentifierExtension.create(leafKeys.publicKey)
    //   ]
    // });

    // console.log("leafCert: ", leafCert);

    return "";
  };

  return {
    createCa,
    getCaCsr,
    getCaCert,
    issueCertFromCa
  };
};
