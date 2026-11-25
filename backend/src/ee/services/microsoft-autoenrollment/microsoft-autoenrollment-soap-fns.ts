import { id_ce_extKeyUsage, id_ce_keyUsage } from "@peculiar/asn1-x509";
import * as x509 from "@peculiar/x509";
import { XMLParser } from "fast-xml-parser";
import RE2 from "re2";

import { convertRawCertsToPkcs7 } from "@app/ee/services/certificate-est/certificate-est-fns";
import { extractX509CertFromChain } from "@app/lib/certificates/extract-certificate";
import { BadRequestError } from "@app/lib/errors";
import { asNonSharedBuffer } from "@app/lib/fn";
import { decodeXmlNamedEntities, escapeXml } from "@app/lib/xml";
import { CUSTOM_EXTENSION_PRESET_OIDS } from "@app/services/certificate-common/certificate-constants";
import { TIssuerAddedExtension } from "@app/services/certificate-v3/certificate-v3-types";

import { TTemplatePrivateKey } from "./microsoft-autoenrollment-template-fns";

const NS_ADDRESSING = "http://www.w3.org/2005/08/addressing";
const NS_SOAP = "http://www.w3.org/2003/05/soap-envelope";
const NS_SECEXT = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";
const NS_X509_TOKEN = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3";
const NS_ENROLLMENT = "http://schemas.microsoft.com/windows/pki/2009/01/enrollment";
const NS_ENROLLMENT_POLICY = "http://schemas.microsoft.com/windows/pki/2009/01/enrollmentpolicy";
const NS_WS_TRUST = "http://docs.oasis-open.org/ws-sx/ws-trust/200512";

const GET_POLICIES_ACTION = `${NS_ENROLLMENT_POLICY}/IPolicy/GetPolicies`;
const GET_POLICIES_RESPONSE_ACTION = `${GET_POLICIES_ACTION}Response`;
const WSTEP_REQUEST_ACTION = `${NS_ENROLLMENT}/RST/wstep`;
const WSTEP_RESPONSE_ACTION = `${NS_ENROLLMENT}/RSTRC/wstep`;
const FAULT_ACTION = `${NS_ADDRESSING}/soap/fault`;
const ENROLLMENT_DETAIL_FAULT_ACTION = `${NS_ENROLLMENT}/RequestSecurityTokenCertificateEnrollmentWSDetailFault`;
const ISSUE_REQUEST_TYPE = `${NS_WS_TRUST}/Issue`;
const QUERY_TOKEN_STATUS_REQUEST_TYPE = `${NS_ENROLLMENT}/QueryTokenStatus`;

const POLICY_NEXT_UPDATE_HOURS = 8;
const POLICY_SUBJECT_NAME_FLAGS = 0x18000000;
const POLICY_ENROLLMENT_FLAGS = 32;
const POLICY_GENERAL_FLAGS = 64;
const OID_GROUP_HASH_ALGORITHM = 1;
const OID_GROUP_PUBLIC_KEY = 3;
const OID_GROUP_EXTENSION = 6;
const OID_GROUP_TEMPLATE = 9;
const CA_CLIENT_AUTHENTICATION_KERBEROS = 2;

const RSA_KEY_POLICY = {
  policySchema: 2,
  keySpec: 1,
  cryptoProvider: "Microsoft RSA SChannel Cryptographic Provider"
};
const ELLIPTIC_CURVE_KEY_POLICY = {
  policySchema: 3,
  keySpec: 2,
  cryptoProvider: "Microsoft Software Key Storage Provider"
};

const EXTENSION_NAMES: Record<string, string> = {
  [id_ce_extKeyUsage]: "Enhanced Key Usage",
  [id_ce_keyUsage]: "Key Usage",
  [CUSTOM_EXTENSION_PRESET_OIDS.MS_CERTIFICATE_TEMPLATE_INFORMATION]: "Certificate Template Information"
};

const BASE64_NOISE = new RE2("&#x?[0-9a-fA-F]+;|\\s", "g");

const soapParser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: true,
  parseTagValue: false,
  processEntities: false
});

type TXmlNode = Record<string, unknown>;

export enum SoapOperation {
  GetPolicies = "get-policies",
  Issue = "issue",
  QueryTokenStatus = "query-token-status",
  Unsupported = "unsupported"
}

export type TParsedSoapEnvelope = {
  messageId: string | null;
  operation: SoapOperation;
  binarySecurityToken: Buffer | null;
  requestId: string | null;
};

type TPolicyTemplate = {
  templateOid: string;
  templateName: string;
  validitySeconds: number;
  renewalPeriodSeconds: number;
  privateKey: TTemplatePrivateKey;
  hashAlgorithm: { oid: string; name: string };
  majorRevision: number;
  minorRevision: number;
  extensions: TIssuerAddedExtension[];
  caCertificate: Buffer;
  cesUrl: string;
};

const nillable = (name: string, content: string) =>
  content ? `<${name}>${content}</${name}>` : `<${name} xsi:nil="true"/>`;

const childOf = (node: unknown, name: string): unknown =>
  node && typeof node === "object" ? (node as TXmlNode)[name] : undefined;

const textOf = (node: unknown): string | null => (typeof node === "string" && node.trim() ? node.trim() : null);

const decodedTextOf = (node: unknown) => {
  const text = textOf(node);
  return text === null ? null : decodeXmlNamedEntities(text);
};

const resolveSoapOperation = ({
  action,
  requestType,
  hasToken,
  hasRequestId
}: {
  action: string | null;
  requestType: string | null;
  hasToken: boolean;
  hasRequestId: boolean;
}) => {
  if (action === GET_POLICIES_ACTION) return SoapOperation.GetPolicies;
  if (action !== WSTEP_REQUEST_ACTION) return SoapOperation.Unsupported;
  if (requestType === QUERY_TOKEN_STATUS_REQUEST_TYPE) return SoapOperation.QueryTokenStatus;
  if (requestType !== ISSUE_REQUEST_TYPE) return SoapOperation.Unsupported;
  return !hasToken && hasRequestId ? SoapOperation.QueryTokenStatus : SoapOperation.Issue;
};

export const parseSoapEnvelope = (xml: string): TParsedSoapEnvelope => {
  let parsed: unknown;
  try {
    parsed = soapParser.parse(xml, true);
  } catch {
    throw new BadRequestError({ message: "The request body is not a valid SOAP envelope." });
  }

  const envelope = childOf(parsed, "Envelope");
  const header = childOf(envelope, "Header");
  const requestSecurityToken = childOf(childOf(envelope, "Body"), "RequestSecurityToken");
  const encodedToken = textOf(childOf(requestSecurityToken, "BinarySecurityToken"));
  const requestId = decodedTextOf(childOf(requestSecurityToken, "RequestID"));

  return {
    messageId: decodedTextOf(childOf(header, "MessageID")),
    operation: resolveSoapOperation({
      action: decodedTextOf(childOf(header, "Action")),
      requestType: decodedTextOf(childOf(requestSecurityToken, "RequestType")),
      hasToken: Boolean(encodedToken),
      hasRequestId: Boolean(requestId)
    }),
    binarySecurityToken: encodedToken ? Buffer.from(encodedToken.replace(BASE64_NOISE, ""), "base64") : null,
    requestId
  };
};

const buildEnvelope = (action: string, relatesTo: string | null, body: string) =>
  `<s:Envelope xmlns:s="${NS_SOAP}" xmlns:a="${NS_ADDRESSING}"><s:Header><a:Action s:mustUnderstand="1">${action}</a:Action>${
    relatesTo ? `<a:RelatesTo>${escapeXml(relatesTo)}</a:RelatesTo>` : ""
  }</s:Header>${body}</s:Envelope>`;

export const buildGetPoliciesResponse = ({
  relatesTo,
  policyId,
  policyFriendlyName,
  template
}: {
  relatesTo: string | null;
  policyId: string;
  policyFriendlyName: string;
  template: TPolicyTemplate | null;
}) => {
  const ellipticCurve = template?.privateKey.ellipticCurve ?? null;
  const keyPolicy = ellipticCurve ? ELLIPTIC_CURVE_KEY_POLICY : RSA_KEY_POLICY;
  const oids: { value: string; group: number; name: string }[] = [];
  const addOid = (value: string, group: number, name: string) => oids.push({ value, group, name }) - 1;

  const extensionOidReferences =
    template?.extensions.map((extension) =>
      addOid(extension.oid, OID_GROUP_EXTENSION, EXTENSION_NAMES[extension.oid] ?? extension.oid)
    ) ?? [];
  const algorithmOIDReference = ellipticCurve
    ? String(addOid(ellipticCurve.oid, OID_GROUP_PUBLIC_KEY, ellipticCurve.name))
    : "";
  const hashAlgorithmOIDReference = template
    ? addOid(template.hashAlgorithm.oid, OID_GROUP_HASH_ALGORITHM, template.hashAlgorithm.name)
    : null;
  const policyOIDReference = template ? addOid(template.templateOid, OID_GROUP_TEMPLATE, template.templateName) : null;

  const policies = template
    ? `<policy><policyOIDReference>${policyOIDReference}</policyOIDReference><cAs><cAReference>0</cAReference></cAs><attributes><commonName>${escapeXml(
        template.templateName
      )}</commonName><policySchema>${keyPolicy.policySchema}</policySchema><certificateValidity><validityPeriodSeconds>${
        template.validitySeconds
      }</validityPeriodSeconds><renewalPeriodSeconds>${
        template.renewalPeriodSeconds
      }</renewalPeriodSeconds></certificateValidity><permission><enroll>true</enroll><autoEnroll>true</autoEnroll></permission><privateKeyAttributes><minimalKeyLength>${
        template.privateKey.minimalKeyLength
      }</minimalKeyLength><keySpec>${
        keyPolicy.keySpec
      }</keySpec><keyUsageProperty xsi:nil="true"/><permissions xsi:nil="true"/>${nillable(
        "algorithmOIDReference",
        algorithmOIDReference
      )}<cryptoProviders><provider>${keyPolicy.cryptoProvider}</provider></cryptoProviders></privateKeyAttributes><revision><majorRevision>${
        template.majorRevision
      }</majorRevision><minorRevision>${
        template.minorRevision
      }</minorRevision></revision><supersededPolicies xsi:nil="true"/><privateKeyFlags>0</privateKeyFlags><subjectNameFlags>${POLICY_SUBJECT_NAME_FLAGS}</subjectNameFlags><enrollmentFlags>${POLICY_ENROLLMENT_FLAGS}</enrollmentFlags><generalFlags>${POLICY_GENERAL_FLAGS}</generalFlags><hashAlgorithmOIDReference>${hashAlgorithmOIDReference}</hashAlgorithmOIDReference><rARequirements xsi:nil="true"/><keyArchivalAttributes xsi:nil="true"/><extensions>${template.extensions
        .map(
          (extension, index) =>
            `<extension><oIDReference>${extensionOidReferences[index]}</oIDReference><critical>${extension.critical}</critical><value>${extension.value.toString(
              "base64"
            )}</value></extension>`
        )
        .join("")}</extensions></attributes></policy>`
    : "";

  const cas = template
    ? `<cA><uris><cAURI><clientAuthentication>${CA_CLIENT_AUTHENTICATION_KERBEROS}</clientAuthentication><uri>${escapeXml(
        template.cesUrl
      )}</uri><priority>1</priority><renewalOnly>false</renewalOnly></cAURI></uris><certificate>${template.caCertificate.toString(
        "base64"
      )}</certificate><enrollPermission>true</enrollPermission><cAReferenceID>0</cAReferenceID></cA>`
    : "";

  const oidXml = oids
    .map(
      (oid, index) =>
        `<oID><value>${oid.value}</value><group>${oid.group}</group><oIDReferenceID>${index}</oIDReferenceID><defaultName>${escapeXml(
          oid.name
        )}</defaultName></oID>`
    )
    .join("");

  return buildEnvelope(
    GET_POLICIES_RESPONSE_ACTION,
    relatesTo,
    `<s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><GetPoliciesResponse xmlns="${NS_ENROLLMENT_POLICY}"><response><policyID>${escapeXml(
      policyId
    )}</policyID><policyFriendlyName>${escapeXml(
      policyFriendlyName
    )}</policyFriendlyName><nextUpdateHours>${POLICY_NEXT_UPDATE_HOURS}</nextUpdateHours><policiesNotChanged xsi:nil="true"/>${nillable("policies", policies)}</response>${nillable("cAs", cas)}${nillable(
      "oIDs",
      oidXml
    )}</GetPoliciesResponse></s:Body>`
  );
};

const buildTokenResponse = (relatesTo: string | null, content: string) =>
  buildEnvelope(
    WSTEP_RESPONSE_ACTION,
    relatesTo,
    `<s:Body><RequestSecurityTokenResponseCollection xmlns="${NS_WS_TRUST}"><RequestSecurityTokenResponse><TokenType>${NS_X509_TOKEN}</TokenType>${content}</RequestSecurityTokenResponse></RequestSecurityTokenResponseCollection></s:Body>`
  );

const buildDisposition = (message: string) =>
  `<DispositionMessage xml:lang="en-US" xmlns="${NS_ENROLLMENT}">${escapeXml(message)}</DispositionMessage>`;

const buildRequestId = (requestId: string) => `<RequestID xmlns="${NS_ENROLLMENT}">${escapeXml(requestId)}</RequestID>`;

const buildIssuedResponse = ({
  relatesTo,
  requestId,
  certificate,
  certificateChainPkcs7
}: {
  relatesTo: string | null;
  requestId: string;
  certificate: Buffer;
  certificateChainPkcs7: string;
}) =>
  buildTokenResponse(
    relatesTo,
    `${buildDisposition("Issued")}<BinarySecurityToken ValueType="${NS_SECEXT}#PKCS7" EncodingType="${NS_SECEXT}#base64binary" xmlns="${NS_SECEXT}">${certificateChainPkcs7}</BinarySecurityToken><RequestedSecurityToken><BinarySecurityToken ValueType="${NS_X509_TOKEN}" EncodingType="${NS_SECEXT}#base64binary" xmlns="${NS_SECEXT}">${certificate.toString(
      "base64"
    )}</BinarySecurityToken></RequestedSecurityToken>${buildRequestId(requestId)}`
  );

export const buildIssuedResponseFromPem = ({
  relatesTo,
  requestId,
  certificatePem,
  certificateChainPem
}: {
  relatesTo: string | null;
  requestId: string;
  certificatePem: string | Buffer;
  certificateChainPem: string | null;
}) => {
  const certificate = new x509.X509Certificate(
    typeof certificatePem === "string" ? certificatePem : asNonSharedBuffer(certificatePem)
  );
  const chain = certificateChainPem
    ? extractX509CertFromChain(certificateChainPem).map((pem) => new x509.X509Certificate(pem).rawData)
    : [];
  return buildIssuedResponse({
    relatesTo,
    requestId,
    certificate: Buffer.from(certificate.rawData),
    certificateChainPkcs7: convertRawCertsToPkcs7([certificate.rawData, ...chain])
      .split("\n")
      .join("")
  });
};

export const buildPendingResponse = ({
  relatesTo,
  requestId,
  cesUrl
}: {
  relatesTo: string | null;
  requestId: string;
  cesUrl: string;
}) =>
  buildTokenResponse(
    relatesTo,
    `${buildDisposition("Pending approval in Infisical")}<RequestedSecurityToken><SecurityTokenReference xmlns="${NS_SECEXT}"><Reference URI="${escapeXml(
      cesUrl
    )}"/></SecurityTokenReference></RequestedSecurityToken>${buildRequestId(requestId)}`
  );

export const buildSoapFault = ({
  relatesTo,
  message,
  enrollmentDetail
}: {
  relatesTo: string | null;
  message: string;
  enrollmentDetail?: { errorCode: number; isInvalidRequest: boolean; requestId: string | null };
}) =>
  buildEnvelope(
    enrollmentDetail ? ENROLLMENT_DETAIL_FAULT_ACTION : FAULT_ACTION,
    relatesTo,
    `<s:Body><s:Fault><s:Code><s:Value>s:Receiver</s:Value></s:Code><s:Reason><s:Text xml:lang="en-US">${escapeXml(
      message
    )}</s:Text></s:Reason>${
      enrollmentDetail
        ? `<s:Detail><CertificateEnrollmentWSDetail xmlns="${NS_ENROLLMENT}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><BinaryResponse xsi:nil="true"/><ErrorCode>${
            enrollmentDetail.errorCode
          }</ErrorCode><InvalidRequest>${enrollmentDetail.isInvalidRequest}</InvalidRequest>${
            enrollmentDetail.requestId
              ? `<RequestID>${escapeXml(enrollmentDetail.requestId)}</RequestID>`
              : '<RequestID xsi:nil="true"/>'
          }</CertificateEnrollmentWSDetail></s:Detail>`
        : ""
    }</s:Fault></s:Body>`
  );
