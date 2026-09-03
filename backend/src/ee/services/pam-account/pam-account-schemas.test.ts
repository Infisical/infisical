import { describe, expect, test } from "vitest";

import { PamAccountType, PamPostgresAuthMethod } from "../pam/pam-enums";
import {
  accountTypeRequiresRecording,
  applyForcedFields,
  buildPamAccountTypeMetadata,
  getAccountAccessibilityIssues,
  isCredentialConfigured,
  PamAccountAccessibilityIssue,
  PamAccountTypeMetadataSchema,
  PamFieldDescriptorSchema,
  sanitizeCredentials,
  suppliesCredentialSecret,
  validateCredentials
} from "./pam-account-schemas";

// These assertions exercise the Zod-introspection path (buildPamAccountTypeMetadata reads schema internals to derive field descriptors)
describe("buildPamAccountTypeMetadata", () => {
  const metadata = buildPamAccountTypeMetadata(
    new Set([PamAccountType.Postgres, PamAccountType.MySQL, PamAccountType.SSH, PamAccountType.Redis])
  );
  const byType = new Map(metadata.map((m) => [m.type, m]));

  test("flags web-access support from the provided supported-types set", () => {
    expect(byType.get(PamAccountType.Postgres)?.supportsWebAccess).toBe(true);
    expect(byType.get(PamAccountType.SSH)?.supportsWebAccess).toBe(true);
    expect(byType.get(PamAccountType.MySQL)?.supportsWebAccess).toBe(true);
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
      required: false,
      showWhen: { field: "authMethod", equals: "password" }
    });
    expect(fieldByKey(postgres!.credentialFields, "awsRegion")).toMatchObject({
      widget: "text",
      required: true,
      showWhen: { field: "authMethod", equals: "aws-iam" }
    });
    expect(fieldByKey(postgres!.credentialFields, "roleArn")).toMatchObject({
      required: true,
      showWhen: { field: "authMethod", equals: "aws-iam" }
    });
  });

  test("pins Postgres SSL to the auth method that requires it, across field groups", () => {
    const postgres = byType.get(PamAccountType.Postgres);
    expect(fieldByKey(postgres!.connectionFields, "sslEnabled")?.forceWhen).toEqual([
      {
        when: { field: "credentials.authMethod", equals: "aws-iam" },
        value: true,
        reason: expect.any(String) as string
      }
    ]);
  });

  test("only advertises connection string schemes for types that accept them", () => {
    expect(byType.get(PamAccountType.Postgres)?.connectionStringSchemes).toEqual(["postgres", "postgresql"]);
    expect(byType.get(PamAccountType.MySQL)?.connectionStringSchemes).toBeUndefined();
    expect(byType.get(PamAccountType.SSH)?.connectionStringSchemes).toBeUndefined();
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

  test("derives Redis connection and credential fields from the schema", () => {
    const redis = byType.get(PamAccountType.Redis);
    expect(redis).toBeDefined();
    expect(redis?.name).toBe("Redis");
    expect(redis?.supportsWebAccess).toBe(true);

    expect(redis?.connectionFields.map((f) => f.key)).toEqual([
      "host",
      "port",
      "sslEnabled",
      "sslRejectUnauthorized",
      "sslCertificate"
    ]);
    expect(fieldByKey(redis!.connectionFields, "port")).toMatchObject({
      widget: "number",
      required: true,
      defaultValue: 6379
    });

    expect(fieldByKey(redis!.credentialFields, "username")).toMatchObject({
      widget: "text",
      required: true,
      secret: false,
      defaultValue: "default"
    });
    expect(fieldByKey(redis!.credentialFields, "password")).toMatchObject({
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
});

describe("credentials without an auth method", () => {
  test("Postgres credentials parse as password auth", () => {
    expect(validateCredentials(PamAccountType.Postgres, { username: "u", password: "p" })).toEqual({
      authMethod: PamPostgresAuthMethod.Password,
      username: "u",
      password: "p"
    });
  });

  test("an explicit auth method is left alone", () => {
    expect(
      validateCredentials(PamAccountType.Postgres, {
        authMethod: PamPostgresAuthMethod.AwsIam,
        username: "iam_user",
        awsRegion: "us-east-1",
        roleArn: "arn:aws:iam::123456789012:role/pam"
      })
    ).toEqual({
      authMethod: PamPostgresAuthMethod.AwsIam,
      username: "iam_user",
      awsRegion: "us-east-1",
      roleArn: "arn:aws:iam::123456789012:role/pam"
    });
  });

  test("switching to AWS IAM drops the password that is no longer part of the credential", () => {
    expect(
      validateCredentials(PamAccountType.Postgres, {
        authMethod: PamPostgresAuthMethod.AwsIam,
        username: "u",
        password: "stale",
        awsRegion: "us-east-1",
        roleArn: "arn:aws:iam::123456789012:role/pam"
      })
    ).not.toHaveProperty("password");
  });

  test("account types that never changed shape still reject a missing discriminator", () => {
    expect(() => validateCredentials(PamAccountType.SSH, { username: "u", password: "p" })).toThrow();
  });

  test("sanitized credentials report the effective auth method", () => {
    expect(sanitizeCredentials(PamAccountType.Postgres, { username: "u", password: "p" })).toMatchObject({
      authMethod: PamPostgresAuthMethod.Password,
      username: "u"
    });
  });
});

describe("applyForcedFields", () => {
  const forPostgres = (credentials: Record<string, unknown>, connectionDetails: Record<string, unknown> = {}) =>
    applyForcedFields(PamAccountType.Postgres, {
      connectionDetails: { host: "db.example.com", sslEnabled: false, ...connectionDetails },
      credentials
    });

  test("AWS IAM turns SSL on, since the login cannot work without it", () => {
    const result = forPostgres({ authMethod: PamPostgresAuthMethod.AwsIam, username: "u", awsRegion: "us-east-1" });
    expect(result.connectionDetails.sslEnabled).toBe(true);
  });

  test("password auth leaves the connection alone", () => {
    const result = forPostgres({ authMethod: PamPostgresAuthMethod.Password, username: "u", password: "p" });
    expect(result.connectionDetails.sslEnabled).toBe(false);
  });

  test("credentials the caller passed are never mutated", () => {
    const connectionDetails = { host: "db.example.com", sslEnabled: false };
    applyForcedFields(PamAccountType.Postgres, {
      connectionDetails,
      credentials: { authMethod: PamPostgresAuthMethod.AwsIam, username: "u", awsRegion: "us-east-1" }
    });
    expect(connectionDetails.sslEnabled).toBe(false);
  });

  test("account types with no forced fields pass their values through", () => {
    const values = { connectionDetails: { host: "db", sslEnabled: false }, credentials: { username: "u" } };
    expect(applyForcedFields(PamAccountType.MySQL, values)).toEqual(values);
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

describe("suppliesCredentialSecret", () => {
  test("a resent username and auth method is not a supplied secret", () => {
    expect(suppliesCredentialSecret(PamAccountType.Postgres, { authMethod: "password", username: "pamadmin" })).toBe(
      false
    );
  });

  test("a real password is", () => {
    expect(
      suppliesCredentialSecret(PamAccountType.Postgres, {
        authMethod: "password",
        username: "pamadmin",
        password: "hunter2"
      })
    ).toBe(true);
  });

  test("an empty or whitespace password is not", () => {
    expect(suppliesCredentialSecret(PamAccountType.Postgres, { password: "" })).toBe(false);
    expect(suppliesCredentialSecret(PamAccountType.Postgres, { password: "   " })).toBe(false);
  });

  test("an absent credentials object is not", () => {
    expect(suppliesCredentialSecret(PamAccountType.Postgres, undefined)).toBe(false);
  });

  test("a certificate account never supplies one", () => {
    expect(suppliesCredentialSecret(PamAccountType.SSH, { authMethod: "certificate", username: "pamuser" })).toBe(
      false
    );
  });
});
