import { describe, expect, test } from "vitest";

import { PamAccountType } from "../pam/pam-enums";
import {
  accountTypeRequiresRecording,
  buildPamAccountTypeMetadata,
  getAccountAccessibilityIssues,
  isCredentialConfigured,
  PamAccountAccessibilityIssue,
  PamAccountTypeMetadataSchema,
  PamFieldDescriptorSchema,
  parseWebResourceUrl
} from "./pam-account-schemas";

// These assertions exercise the Zod-introspection path (buildPamAccountTypeMetadata reads schema internals to derive field descriptors)
describe("buildPamAccountTypeMetadata", () => {
  const metadata = buildPamAccountTypeMetadata(
    new Set([PamAccountType.Postgres, PamAccountType.MySQL, PamAccountType.SSH, PamAccountType.WebResource])
  );
  const byType = new Map(metadata.map((m) => [m.type, m]));

  test("flags web-access support from the provided supported-types set", () => {
    expect(byType.get(PamAccountType.Postgres)?.supportsWebAccess).toBe(true);
    expect(byType.get(PamAccountType.SSH)?.supportsWebAccess).toBe(true);
    expect(byType.get(PamAccountType.MySQL)?.supportsWebAccess).toBe(true);
    expect(byType.get(PamAccountType.WebResource)?.supportsWebAccess).toBe(true);
    expect(byType.get(PamAccountType.Kubernetes)?.supportsWebAccess).toBe(false);
  });

  const fieldByKey = <T extends { key: string }>(fields: T[], key: string) => fields.find((f) => f.key === key);

  test("emits valid, non-empty field descriptors for every configured account type", () => {
    expect(metadata.length).toBeGreaterThan(0);

    metadata.forEach((meta) => {
      expect(PamAccountTypeMetadataSchema.safeParse(meta).success).toBe(true);

      expect(meta.connectionFields.length + meta.credentialFields.length).toBeGreaterThan(0);
      [...meta.connectionFields, ...meta.credentialFields].forEach((field) => {
        expect(PamFieldDescriptorSchema.safeParse(field).success).toBe(true);
      });
    });
  });

  test("derives Postgres connection and credential fields from the schema", () => {
    const postgres = byType.get(PamAccountType.Postgres);
    expect(postgres).toBeDefined();
    expect(postgres?.name).toBe("PostgreSQL");

    expect(postgres?.connectionFields.map((f) => f.key)).toEqual([
      "host",
      "port",
      "database",
      "sslEnabled",
      "sslRejectUnauthorized",
      "sslCertificate"
    ]);
    expect(fieldByKey(postgres!.connectionFields, "host")).toMatchObject({
      widget: "text",
      required: true
    });
    expect(fieldByKey(postgres!.connectionFields, "port")).toMatchObject({
      widget: "number",
      required: true,
      defaultValue: 5432
    });
    expect(fieldByKey(postgres!.connectionFields, "sslEnabled")).toMatchObject({ widget: "boolean" });

    expect(fieldByKey(postgres!.connectionFields, "sslCertificate")).toMatchObject({
      widget: "textarea",
      required: false
    });

    expect(fieldByKey(postgres!.credentialFields, "username")).toMatchObject({
      widget: "text",
      required: true,
      secret: false
    });
    expect(fieldByKey(postgres!.credentialFields, "password")).toMatchObject({
      widget: "password",
      secret: true,
      required: false
    });
  });

  test("derives MySQL connection and credential fields from the schema", () => {
    const mysql = byType.get(PamAccountType.MySQL);
    expect(mysql).toBeDefined();
    expect(mysql?.name).toBe("MySQL");

    expect(mysql?.connectionFields.map((f) => f.key)).toEqual([
      "host",
      "port",
      "database",
      "sslEnabled",
      "sslRejectUnauthorized",
      "sslCertificate"
    ]);
    expect(fieldByKey(mysql!.connectionFields, "host")).toMatchObject({ widget: "text", required: true });
    expect(fieldByKey(mysql!.connectionFields, "port")).toMatchObject({ widget: "number", required: true });

    expect(fieldByKey(mysql!.credentialFields, "username")).toMatchObject({
      widget: "text",
      required: true,
      secret: false
    });
    expect(fieldByKey(mysql!.credentialFields, "password")).toMatchObject({
      widget: "password",
      secret: true,
      required: false
    });
  });

  test("derives Kubernetes connection and credential fields from the schema", () => {
    const k8s = byType.get(PamAccountType.Kubernetes);
    expect(k8s).toBeDefined();
    expect(k8s?.name).toBe("Kubernetes");

    expect(k8s?.connectionFields.map((f) => f.key)).toEqual(["url", "sslRejectUnauthorized", "sslCertificate"]);
    expect(fieldByKey(k8s!.connectionFields, "url")).toMatchObject({ widget: "text", required: true });
    expect(fieldByKey(k8s!.connectionFields, "sslRejectUnauthorized")).toMatchObject({
      widget: "boolean",
      required: true
    });
    expect(fieldByKey(k8s!.connectionFields, "sslCertificate")).toMatchObject({ widget: "textarea", required: false });

    const authMethod = fieldByKey(k8s!.credentialFields, "authMethod");
    expect(authMethod).toMatchObject({ widget: "select", required: true });
    expect(authMethod?.options?.map((o) => o.value)).toEqual(["service-account-token", "gateway-kubernetes-auth"]);

    expect(fieldByKey(k8s!.credentialFields, "serviceAccountToken")).toMatchObject({
      widget: "textarea",
      secret: true,
      showWhen: { field: "authMethod", equals: "service-account-token" }
    });
    expect(fieldByKey(k8s!.credentialFields, "namespace")).toMatchObject({
      widget: "text",
      required: true,
      showWhen: { field: "authMethod", equals: "gateway-kubernetes-auth" }
    });
    expect(fieldByKey(k8s!.credentialFields, "serviceAccountName")).toMatchObject({
      widget: "text",
      required: true,
      showWhen: { field: "authMethod", equals: "gateway-kubernetes-auth" }
    });
  });

  test("flattens the SSH discriminated union into a select plus conditional variant fields", () => {
    const ssh = byType.get(PamAccountType.SSH);
    expect(ssh).toBeDefined();
    expect(ssh?.connectionFields.map((f) => f.key)).toEqual(["host", "port"]);

    const authMethod = fieldByKey(ssh!.credentialFields, "authMethod");
    expect(authMethod).toMatchObject({ widget: "select", required: true });
    expect(authMethod?.options?.map((o) => o.value)).toEqual(["password", "public-key", "certificate"]);

    const username = fieldByKey(ssh!.credentialFields, "username");
    expect(username).toMatchObject({ widget: "text", required: true });
    expect(username?.showWhen).toBeUndefined();

    expect(fieldByKey(ssh!.credentialFields, "password")).toMatchObject({
      widget: "password",
      secret: true,
      showWhen: { field: "authMethod", equals: "password" }
    });
    expect(fieldByKey(ssh!.credentialFields, "privateKey")).toMatchObject({
      widget: "textarea",
      secret: true,
      showWhen: { field: "authMethod", equals: "public-key" }
    });
  });

  test("derives Web Resource fields from the schema", () => {
    const webResource = byType.get(PamAccountType.WebResource);
    expect(webResource).toBeDefined();
    expect(webResource?.name).toBe("Web Resource");
    expect(webResource?.connectionFields.map((f) => f.key)).toEqual(["url"]);
    expect(fieldByKey(webResource!.connectionFields, "url")).toMatchObject({
      widget: "text",
      required: true
    });
    expect(fieldByKey(webResource!.connectionFields, "url")?.defaultValue).toBeUndefined();
    expect(webResource?.credentialFields).toEqual([]);
  });
});

describe("isCredentialConfigured", () => {
  test("Postgres/MySQL require a non-empty password", () => {
    expect(isCredentialConfigured(PamAccountType.Postgres, { username: "u", password: "p" })).toBe(true);
    expect(isCredentialConfigured(PamAccountType.Postgres, { username: "u", password: "  " })).toBe(false);
    expect(isCredentialConfigured(PamAccountType.MySQL, { username: "u" })).toBe(false);
  });

  test("Kubernetes credential depends on the auth method", () => {
    expect(
      isCredentialConfigured(PamAccountType.Kubernetes, {
        authMethod: "service-account-token",
        serviceAccountToken: "token123"
      })
    ).toBe(true);
    expect(
      isCredentialConfigured(PamAccountType.Kubernetes, {
        authMethod: "service-account-token",
        serviceAccountToken: ""
      })
    ).toBe(false);
    expect(isCredentialConfigured(PamAccountType.Kubernetes, { authMethod: "service-account-token" })).toBe(false);
    expect(
      isCredentialConfigured(PamAccountType.Kubernetes, {
        authMethod: "gateway-kubernetes-auth",
        namespace: "default",
        serviceAccountName: "my-sa"
      })
    ).toBe(true);
  });

  test("SSH credential depends on the auth method", () => {
    expect(isCredentialConfigured(PamAccountType.SSH, { authMethod: "password", password: "p" })).toBe(true);
    expect(isCredentialConfigured(PamAccountType.SSH, { authMethod: "password" })).toBe(false);
    expect(isCredentialConfigured(PamAccountType.SSH, { authMethod: "public-key", privateKey: "k" })).toBe(true);
    expect(isCredentialConfigured(PamAccountType.SSH, { authMethod: "public-key" })).toBe(false);

    expect(isCredentialConfigured(PamAccountType.SSH, { authMethod: "certificate" })).toBe(true);
  });

  test("Web Resource has no target credentials", () => {
    expect(isCredentialConfigured(PamAccountType.WebResource, {})).toBe(true);
  });
});

describe("parseWebResourceUrl", () => {
  test("normalizes http URLs with default ports", () => {
    expect(parseWebResourceUrl("http://example.com/")).toEqual({
      url: "http://example.com",
      scheme: "http",
      host: "example.com",
      port: 80,
      basePath: "/"
    });
  });

  test("normalizes https URLs with default ports", () => {
    expect(parseWebResourceUrl("https://secure.example.com:443")).toEqual({
      url: "https://secure.example.com",
      scheme: "https",
      host: "secure.example.com",
      port: 443,
      basePath: "/"
    });
  });

  test("normalizes explicit ports and base paths", () => {
    expect(parseWebResourceUrl("https://10.0.0.5:8443/admin/app/")).toEqual({
      url: "https://10.0.0.5:8443/admin/app",
      scheme: "https",
      host: "10.0.0.5",
      port: 8443,
      basePath: "/admin/app"
    });
  });

  test("normalizes IPv6 targets", () => {
    expect(parseWebResourceUrl("http://[::1]:3005/app")).toEqual({
      url: "http://[::1]:3005/app",
      scheme: "http",
      host: "::1",
      port: 3005,
      basePath: "/app"
    });
  });

  test("rejects malformed URLs and unsupported protocols", () => {
    expect(() => parseWebResourceUrl("example.com")).toThrow(/valid URL/);
    expect(() => parseWebResourceUrl("ftp://example.com")).toThrow(/http or https/);
  });

  test("rejects credentials, query strings, and fragments", () => {
    expect(() => parseWebResourceUrl("http://user@example.com")).toThrow(/username or password/);
    expect(() => parseWebResourceUrl("http://example.com?x=1")).toThrow(/query string/);
    expect(() => parseWebResourceUrl("http://example.com#top")).toThrow(/fragment/);
  });
});

describe("getAccountAccessibilityIssues", () => {
  test("recording is only required for account types that stream to a bucket", () => {
    expect(accountTypeRequiresRecording(PamAccountType.Windows)).toBe(true);
    expect(accountTypeRequiresRecording(PamAccountType.Postgres)).toBe(false);
  });

  test("a fully provisioned non-Windows account has no issues", () => {
    expect(
      getAccountAccessibilityIssues({
        accountType: PamAccountType.Postgres,
        gatewayId: "gw-1",
        templateRecordingConnectionId: null,
        templateSettings: {},
        credentialConfigured: true
      })
    ).toEqual([]);
  });

  test("flags missing gateway and credential", () => {
    expect(
      getAccountAccessibilityIssues({
        accountType: PamAccountType.Postgres,
        templateRecordingConnectionId: null,
        templateSettings: {},
        credentialConfigured: false
      })
    ).toEqual([PamAccountAccessibilityIssue.NoGateway, PamAccountAccessibilityIssue.NoCredential]);
  });

  test("flags missing recording only for Windows", () => {
    expect(
      getAccountAccessibilityIssues({
        accountType: PamAccountType.Windows,
        gatewayId: "gw-1",
        templateRecordingConnectionId: null,
        templateSettings: {},
        credentialConfigured: true
      })
    ).toEqual([PamAccountAccessibilityIssue.NoRecordingConfig]);
  });
});
