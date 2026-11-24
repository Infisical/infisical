import { XMLParser } from "fast-xml-parser";
import { describe, expect, test } from "vitest";

import { BadRequestError } from "@app/lib/errors";

import {
  buildGetPoliciesResponse,
  buildPendingResponse,
  buildSoapFault,
  parseSoapEnvelope,
  SoapOperation
} from "./microsoft-autoenrollment-soap-fns";
import { TTemplatePrivateKey } from "./microsoft-autoenrollment-template-fns";

const MESSAGE_ID = "urn:uuid:0d5a1441-5891-453b-becf-a2e5f6ea3749";

const WSTEP_ACTION = "http://schemas.microsoft.com/windows/pki/2009/01/enrollment/RST/wstep";

const buildRequestEnvelope = (body: string, action = WSTEP_ACTION) =>
  `<s:Envelope xmlns:a="http://www.w3.org/2005/08/addressing" xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Header><a:Action s:mustUnderstand="1">${action}</a:Action><a:MessageID>${MESSAGE_ID}</a:MessageID></s:Header><s:Body>${body}</s:Body></s:Envelope>`;

const readXml = (xml: string) =>
  new XMLParser({ removeNSPrefix: true, ignoreAttributes: true, parseTagValue: false }).parse(xml) as {
    Envelope: { Header: { RelatesTo?: string }; Body: Record<string, unknown> };
  };

describe("parseSoapEnvelope", () => {
  test("reads the message id and a base64 token that Windows wraps with whitespace and character references", () => {
    const token = Buffer.from("certificate request bytes");
    const encoded = token.toString("base64");
    const envelope = parseSoapEnvelope(
      buildRequestEnvelope(
        `<RequestSecurityToken xmlns="http://docs.oasis-open.org/ws-sx/ws-trust/200512"><RequestType>http://docs.oasis-open.org/ws-sx/ws-trust/200512/Issue</RequestType><BinarySecurityToken>${encoded.slice(
          0,
          8
        )}&#xD;\n  ${encoded.slice(8)}</BinarySecurityToken></RequestSecurityToken>`
      )
    );

    expect(envelope.messageId).toBe(MESSAGE_ID);
    expect(envelope.operation).toBe(SoapOperation.Issue);
    expect(envelope.binarySecurityToken?.equals(token)).toBe(true);
    expect(envelope.requestId).toBeNull();
  });

  test("treats a QueryTokenStatus request type as a status query", () => {
    const envelope = parseSoapEnvelope(
      buildRequestEnvelope(
        `<RequestSecurityToken xmlns="http://docs.oasis-open.org/ws-sx/ws-trust/200512"><RequestType>http://schemas.microsoft.com/windows/pki/2009/01/enrollment/QueryTokenStatus</RequestType><RequestID xmlns="http://schemas.microsoft.com/windows/pki/2009/01/enrollment">7a6c2f0e-3c1d-4b8e-9f1a-2b3c4d5e6f70</RequestID></RequestSecurityToken>`
      )
    );

    expect(envelope.operation).toBe(SoapOperation.QueryTokenStatus);
    expect(envelope.requestId).toBe("7a6c2f0e-3c1d-4b8e-9f1a-2b3c4d5e6f70");
  });

  test("treats an Issue request with a request id and no token as a status query", () => {
    const envelope = parseSoapEnvelope(
      buildRequestEnvelope(
        `<RequestSecurityToken><RequestType>http://docs.oasis-open.org/ws-sx/ws-trust/200512/Issue</RequestType><RequestID>7a6c2f0e-3c1d-4b8e-9f1a-2b3c4d5e6f70</RequestID></RequestSecurityToken>`
      )
    );

    expect(envelope.operation).toBe(SoapOperation.QueryTokenStatus);
  });

  test.each([
    ["another request type", WSTEP_ACTION, "http://docs.oasis-open.org/ws-sx/ws-trust/200512/Renew"],
    ["a request type that only ends in QueryTokenStatus", WSTEP_ACTION, "urn:example:QueryTokenStatus"],
    ["no request type", WSTEP_ACTION, null],
    [
      "another action",
      "http://schemas.microsoft.com/windows/pki/2009/01/enrollment/RST/other",
      "http://docs.oasis-open.org/ws-sx/ws-trust/200512/Issue"
    ]
  ])("marks a request with %s as unsupported", (_name, action, requestType) => {
    const envelope = parseSoapEnvelope(
      buildRequestEnvelope(
        `<RequestSecurityToken>${requestType ? `<RequestType>${requestType}</RequestType>` : ""}<BinarySecurityToken>${Buffer.from(
          "token"
        ).toString("base64")}</BinarySecurityToken><RequestID>923</RequestID></RequestSecurityToken>`,
        action
      )
    );

    expect(envelope.operation).toBe(SoapOperation.Unsupported);
  });

  test("decodes XML entities in the message id so the answer does not escape them twice", () => {
    const envelope = parseSoapEnvelope(
      `<s:Envelope xmlns:a="http://www.w3.org/2005/08/addressing" xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Header><a:MessageID>a&lt;b&gt;&amp;c&quot;</a:MessageID></s:Header><s:Body/></s:Envelope>`
    );

    expect(envelope.messageId).toBe(`a<b>&c"`);
    expect(buildSoapFault({ relatesTo: envelope.messageId, message: "refused" })).toContain(
      "<a:RelatesTo>a&lt;b&gt;&amp;c&quot;</a:RelatesTo>"
    );
  });

  test("recognizes only the GetPolicies action as a policy request", () => {
    const policyRequest = (action: string) =>
      parseSoapEnvelope(
        `<s:Envelope xmlns:a="http://www.w3.org/2005/08/addressing" xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Header><a:Action s:mustUnderstand="1">${action}</a:Action></s:Header><s:Body/></s:Envelope>`
      );

    expect(
      policyRequest("http://schemas.microsoft.com/windows/pki/2009/01/enrollmentpolicy/IPolicy/GetPolicies").operation
    ).toBe(SoapOperation.GetPolicies);
    expect(
      policyRequest("http://schemas.microsoft.com/windows/pki/2009/01/enrollmentpolicy/IPolicy/Bogus").operation
    ).toBe(SoapOperation.Unsupported);
  });

  test("rejects a body that is not XML", () => {
    expect(() => parseSoapEnvelope("<s:Envelope><unclosed")).toThrow(BadRequestError);
  });
});

describe("SOAP response builders", () => {
  test("escapes the caller's message id in RelatesTo", () => {
    const relatesTo = `urn:uuid:1</a:RelatesTo><a:Injected>x</a:Injected><a:RelatesTo>`;
    const xml = buildSoapFault({ relatesTo, message: "refused" });

    expect(xml).not.toContain("<a:Injected>");
    expect(readXml(xml).Envelope.Header.RelatesTo).toBe(relatesTo);
  });

  test("escapes the fault message", () => {
    const xml = buildSoapFault({ relatesTo: null, message: `Computer <PC&1> refused` });

    expect(xml).toContain("Computer &lt;PC&amp;1&gt; refused");
    expect(xml).not.toContain("RelatesTo");
  });

  test("lists no template when the computer is not allowed to enroll", () => {
    const xml = buildGetPoliciesResponse({
      relatesTo: MESSAGE_ID,
      policyId: "{ABC}",
      policyFriendlyName: "web-servers",
      template: null
    });
    const response = readXml(xml).Envelope.Body.GetPoliciesResponse as Record<string, Record<string, unknown>>;

    expect(readXml(xml).Envelope.Header.RelatesTo).toBe(MESSAGE_ID);
    expect(xml).toContain('<policies xsi:nil="true"/>');
    expect(xml).toContain('<cAs xsi:nil="true"/>');
    expect(xml).toContain('<oIDs xsi:nil="true"/>');
    expect(response.response).toBeDefined();
  });

  const buildTemplate = (privateKey: TTemplatePrivateKey) => ({
    templateOid: "1.3.6.1.4.1.67766.1.1",
    templateName: "web-servers",
    validitySeconds: 2592000,
    renewalPeriodSeconds: 3628800,
    privateKey,
    hashAlgorithm: { oid: "2.16.840.1.101.3.4.2.1", name: "sha256" },
    majorRevision: 100,
    minorRevision: 3,
    extensions: [{ oid: "2.5.29.37", critical: false, value: Buffer.from([0x30, 0x00]) }],
    caCertificate: Buffer.from("ca"),
    cesUrl: "https://app.example.com/ces/applications/a/profiles/b?x=1&y=2"
  });

  test("points the template at the CES URL, asks for SHA-256 and references the template OID last", () => {
    const xml = buildGetPoliciesResponse({
      relatesTo: MESSAGE_ID,
      policyId: "{ABC}",
      policyFriendlyName: "web-servers",
      template: buildTemplate({ minimalKeyLength: 2048, ellipticCurve: null })
    });

    expect(xml).toContain("<uri>https://app.example.com/ces/applications/a/profiles/b?x=1&amp;y=2</uri>");
    expect(xml).toContain("<policyOIDReference>2</policyOIDReference>");
    expect(xml).toContain("<hashAlgorithmOIDReference>1</hashAlgorithmOIDReference>");
    expect(xml).toContain(
      "<oID><value>2.16.840.1.101.3.4.2.1</value><group>1</group><oIDReferenceID>1</oIDReferenceID>"
    );
    expect(xml).toContain(
      "<oID><value>1.3.6.1.4.1.67766.1.1</value><group>9</group><oIDReferenceID>2</oIDReferenceID>"
    );
  });

  test("an RSA profile asks for a schema 2 SChannel CryptoAPI key of the profile's size, signed with SHA-256", () => {
    const xml = buildGetPoliciesResponse({
      relatesTo: MESSAGE_ID,
      policyId: "{ABC}",
      policyFriendlyName: "web-servers",
      template: buildTemplate({ minimalKeyLength: 4096, ellipticCurve: null })
    });

    expect(xml).toContain("<policySchema>2</policySchema>");
    expect(xml).toContain(
      '<privateKeyAttributes><minimalKeyLength>4096</minimalKeyLength><keySpec>1</keySpec><keyUsageProperty xsi:nil="true"/><permissions xsi:nil="true"/><algorithmOIDReference xsi:nil="true"/><cryptoProviders><provider>Microsoft RSA SChannel Cryptographic Provider</provider></cryptoProviders></privateKeyAttributes>'
    );
    expect(xml).toContain("<hashAlgorithmOIDReference>1</hashAlgorithmOIDReference>");
    expect(xml).not.toContain("<group>3</group>");
  });

  test("an elliptic curve profile asks for a CNG key on the profile's curve", () => {
    const xml = buildGetPoliciesResponse({
      relatesTo: MESSAGE_ID,
      policyId: "{ABC}",
      policyFriendlyName: "web-servers",
      template: buildTemplate({
        minimalKeyLength: 384,
        ellipticCurve: { oid: "1.3.132.0.34", name: "ECDSA_P384" }
      })
    });

    expect(xml).toContain("<policySchema>3</policySchema>");
    expect(xml).toContain(
      '<privateKeyAttributes><minimalKeyLength>384</minimalKeyLength><keySpec>2</keySpec><keyUsageProperty xsi:nil="true"/><permissions xsi:nil="true"/><algorithmOIDReference>1</algorithmOIDReference><cryptoProviders><provider>Microsoft Software Key Storage Provider</provider></cryptoProviders></privateKeyAttributes>'
    );
    expect(xml).toContain(
      "<oID><value>1.3.132.0.34</value><group>3</group><oIDReferenceID>1</oIDReferenceID><defaultName>ECDSA_P384</defaultName></oID>"
    );
    expect(xml).toContain("<hashAlgorithmOIDReference>2</hashAlgorithmOIDReference>");
    expect(xml).toContain("<policyOIDReference>3</policyOIDReference>");
    expect(xml).toContain(
      "<oID><value>1.3.6.1.4.1.67766.1.1</value><group>9</group><oIDReferenceID>3</oIDReferenceID>"
    );
  });

  test("references each extension by the OID entry added for it", () => {
    const xml = buildGetPoliciesResponse({
      relatesTo: MESSAGE_ID,
      policyId: "{ABC}",
      policyFriendlyName: "web-servers",
      template: {
        ...buildTemplate({ minimalKeyLength: 256, ellipticCurve: { oid: "1.2.840.10045.3.1.7", name: "ECDSA_P256" } }),
        extensions: [
          { oid: "2.5.29.37", critical: false, value: Buffer.from([0x30, 0x00]) },
          { oid: "2.5.29.15", critical: true, value: Buffer.from([0x03, 0x01, 0x00]) }
        ]
      }
    });

    expect(xml).toContain("<extension><oIDReference>0</oIDReference><critical>false</critical>");
    expect(xml).toContain("<extension><oIDReference>1</oIDReference><critical>true</critical>");
    expect(xml).toContain("<oID><value>2.5.29.15</value><group>6</group><oIDReferenceID>1</oIDReferenceID>");
    expect(xml).toContain("<algorithmOIDReference>2</algorithmOIDReference>");
    expect(xml).toContain("<oID><value>1.2.840.10045.3.1.7</value><group>3</group><oIDReferenceID>2</oIDReferenceID>");
    expect(xml).toContain("<hashAlgorithmOIDReference>3</hashAlgorithmOIDReference>");
    expect(xml).toContain("<policyOIDReference>4</policyOIDReference>");
  });

  test("a pending answer carries the certificate request id to poll with", () => {
    const xml = buildPendingResponse({
      relatesTo: MESSAGE_ID,
      requestId: "7a6c2f0e-3c1d-4b8e-9f1a-2b3c4d5e6f70",
      cesUrl: "https://app.example.com/ces/applications/a/profiles/b"
    });

    expect(xml).toContain("7a6c2f0e-3c1d-4b8e-9f1a-2b3c4d5e6f70</RequestID>");
    expect(xml).not.toContain("<RequestedSecurityToken><BinarySecurityToken");
  });
});
