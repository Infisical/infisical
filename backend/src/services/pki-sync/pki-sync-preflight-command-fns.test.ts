import { describe, expect, test, vi } from "vitest";

import { PkiSyncStatus } from "./pki-sync-enums";
import { PemCertificateExtension, PkiSyncExportFormat } from "./pki-sync-export-fns";
import { toPosixShellLiteral, toPowerShellLiteral } from "./pki-sync-host-command-fns";
import {
  applyPreflightCommandUpdate,
  buildPreflightCommandFailureMessage,
  buildPreflightCommandPlan,
  buildPreflightFailureSyncResult,
  didPreflightCheckFail,
  normalizeNewPreflightCommand,
  PREFLIGHT_COMMAND_TIMEOUT_MS,
  renderPreflightCommand,
  runPreflightCommand
} from "./pki-sync-preflight-command-fns";
import { TCertificateMap } from "./pki-sync-types";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

const posixJoin = (directory: string, fileName: string) => `${directory}/${fileName}`;
const windowsJoin = (directory: string, fileName: string) => `${directory}\\${fileName}`;

const PEM_OPTIONS = { format: PkiSyncExportFormat.Pem, includePrivateKey: true };

const oneCertificate: TCertificateMap = {
  "app.example.com": {
    cert: "pem",
    privateKey: "key",
    certificateChain: "chain",
    commonName: "app.example.com"
  }
};

const twoCertificates: TCertificateMap = {
  ...oneCertificate,
  "api.example.com": { cert: "pem", privateKey: "key", commonName: "api.example.com" }
};

const planFor = (command: string, certificateMap: TCertificateMap, overrides = {}) =>
  buildPreflightCommandPlan({
    command,
    destinationDirectory: "/etc/ssl/certs",
    certificateMap,
    exportOptions: PEM_OPTIONS,
    joinPath: posixJoin,
    ...overrides
  });

describe("preflight check timeout", () => {
  test("is much shorter than a post-sync command, because it gates delivery", () => {
    expect(PREFLIGHT_COMMAND_TIMEOUT_MS).toBe(10_000);
  });
});

describe("buildPreflightCommandPlan", () => {
  test("returns undefined when no check is configured", () => {
    expect(planFor("", oneCertificate)).toBeUndefined();
    expect(
      buildPreflightCommandPlan({
        command: undefined,
        destinationDirectory: "/etc/ssl/certs",
        certificateMap: oneCertificate,
        exportOptions: PEM_OPTIONS,
        joinPath: posixJoin
      })
    ).toBeUndefined();
  });

  test("still builds a plan when the run would deliver nothing", () => {
    expect(planFor("systemctl is-active nginx", {})?.context.certificateFiles).toEqual([]);
  });

  test("resolves the paths the run is about to write, not what it wrote", () => {
    const plan = planFor("test -f {{certificatePath}}", oneCertificate);

    expect(plan?.context.certificatePath).toBe("/etc/ssl/certs/app.example.com.pem");
    expect(plan?.context.certificateFiles).toEqual([
      "/etc/ssl/certs/app.example.com.pem",
      "/etc/ssl/certs/app.example.com.chain.pem",
      "/etc/ssl/certs/app.example.com.key"
    ]);
  });

  test("resolves the certificate's common name", () => {
    expect(planFor("echo {{commonName}}", oneCertificate)?.context.commonName).toBe("app.example.com");
  });

  test("follows the export format, so PKCS#12 predicts the single .pfx", () => {
    const plan = planFor("test -f {{certificatePath}}", oneCertificate, {
      exportOptions: { format: PkiSyncExportFormat.Pkcs12, includePrivateKey: true }
    });

    expect(plan?.context.certificatePath).toBe("/etc/ssl/certs/app.example.com.pfx");
    expect(plan?.context.certificateFiles).toEqual(["/etc/ssl/certs/app.example.com.pfx"]);
  });

  test("follows the PEM extension and the combined-chain option", () => {
    const plan = planFor("echo {{certificateFiles}}", oneCertificate, {
      exportOptions: {
        format: PkiSyncExportFormat.Pem,
        includePrivateKey: false,
        pemCertificateExtension: PemCertificateExtension.Crt,
        combineCertificateChain: true
      }
    });

    expect(plan?.context.certificateFiles).toEqual(["/etc/ssl/certs/app.example.com.crt"]);
  });

  test("uses the destination's own path separator", () => {
    const plan = buildPreflightCommandPlan({
      command: "Test-Path {{certificatePath}}",
      destinationDirectory: "C:\\certs",
      certificateMap: oneCertificate,
      exportOptions: { format: PkiSyncExportFormat.Pkcs12, includePrivateKey: true },
      joinPath: windowsJoin
    });

    expect(plan?.context.certificatePath).toBe("C:\\certs\\app.example.com.pfx");
  });

  test("carries the PKCS#12 password when the caller supplies it", () => {
    expect(
      planFor("echo {{pkcs12Password}}", oneCertificate, { pkcs12Password: "s3cret" })?.context.pkcs12Password
    ).toBe("s3cret");
  });

  test("rejects a single-certificate variable when the run would cover several", () => {
    expect(() => planFor("test -f {{certificatePath}}", twoCertificates)).toThrow(
      /\{\{certificatePath\}\}.*would deliver 2 certificates/
    );
    expect(() => planFor("echo {{commonName}}", twoCertificates)).toThrow(/would deliver 2 certificates/);
  });

  test("allows run-wide variables for any number of certificates", () => {
    const plan = planFor("echo {{certificateFiles}} in {{certificateDirectory}}", twoCertificates);

    // Only the first has a chain, so the file list is per-certificate rather than a fixed shape.
    expect(plan?.context.certificateFiles).toEqual([
      "/etc/ssl/certs/app.example.com.pem",
      "/etc/ssl/certs/app.example.com.chain.pem",
      "/etc/ssl/certs/app.example.com.key",
      "/etc/ssl/certs/api.example.com.pem",
      "/etc/ssl/certs/api.example.com.key"
    ]);
    expect(plan?.context.certificatePath).toBeUndefined();
    expect(plan?.context.commonName).toBeUndefined();
  });
});

describe("renderPreflightCommand", () => {
  const { context } = planFor("x", oneCertificate)!;

  test("substitutes the prospective path and directory as quoted literals", () => {
    expect(renderPreflightCommand("test -f {{certificatePath}}", context, toPosixShellLiteral)).toBe(
      "test -f '/etc/ssl/certs/app.example.com.pem'"
    );
    expect(renderPreflightCommand("test -d {{certificateDirectory}}", context, toPosixShellLiteral)).toBe(
      "test -d '/etc/ssl/certs'"
    );
  });

  test("quotes a value that would otherwise break out of the command", () => {
    const hostile = { ...context, commonName: "app.example.com'; rm -rf / #" };

    expect(renderPreflightCommand("echo {{commonName}}", hostile, toPosixShellLiteral)).toBe(
      `echo 'app.example.com'\\''; rm -rf / #'`
    );
  });

  test("doubles quotes for PowerShell instead of backslash-escaping", () => {
    const hostile = { ...context, commonName: "app'x" };

    expect(renderPreflightCommand("Write-Output {{commonName}}", hostile, toPowerShellLiteral)).toBe(
      "Write-Output 'app''x'"
    );
  });

  test("leaves braces that are not one of our variables exactly as written", () => {
    expect(renderPreflightCommand("kubectl get po -o jsonpath='{{.status}}'", context, toPosixShellLiteral)).toBe(
      "kubectl get po -o jsonpath='{{.status}}'"
    );
  });
});

describe("runPreflightCommand", () => {
  test("reports success on exit code 0", async () => {
    const result = await runPreflightCommand({
      syncId: "sync-1",
      execute: async () => ({ stdout: "active", stderr: "", exitCode: 0 })
    });

    expect(result.status).toBe(PkiSyncStatus.Succeeded);
    expect(result.output).toBe("active");
    expect(didPreflightCheckFail(result)).toBe(false);
  });

  test("reports failure on a non-zero exit code without throwing", async () => {
    const result = await runPreflightCommand({
      syncId: "sync-1",
      execute: async () => ({ stdout: "", stderr: "inactive", exitCode: 3 })
    });

    expect(result.status).toBe(PkiSyncStatus.Failed);
    expect(result.exitCode).toBe(3);
    expect(didPreflightCheckFail(result)).toBe(true);
  });

  test("reports failure when the host could not be reached at all", async () => {
    const result = await runPreflightCommand({
      syncId: "sync-1",
      execute: async () => {
        throw new Error("gateway unreachable");
      }
    });

    expect(result.status).toBe(PkiSyncStatus.Failed);
    expect(result.exitCode).toBeUndefined();
    expect(result.error).toBe("gateway unreachable");
  });

  test("redacts the export password from captured output", async () => {
    const result = await runPreflightCommand({
      syncId: "sync-1",
      secretsToRedact: ["s3cret"],
      execute: async () => ({ stdout: "opened with s3cret", stderr: "", exitCode: 0 })
    });

    expect(result.output).toBe("opened with [REDACTED]");
  });
});

describe("buildPreflightCommandFailureMessage", () => {
  test("names the check, not the post-sync command", () => {
    expect(
      buildPreflightCommandFailureMessage({
        status: PkiSyncStatus.Failed,
        exitCode: 3,
        durationMs: 12,
        failureDetail: "nginx.service is not running"
      })
    ).toBe("Preflight check failed (exit 3): nginx.service is not running");
  });

  test("reports the exit code alone when the check was silent, rather than restating it", () => {
    expect(
      buildPreflightCommandFailureMessage({
        status: PkiSyncStatus.Failed,
        exitCode: 1,
        durationMs: 12,
        error: "Command exited with code 1"
      })
    ).toBe("Preflight check failed (exit 1)");
  });

  test("omits the exit code when the command never ran", () => {
    expect(
      buildPreflightCommandFailureMessage({
        status: PkiSyncStatus.Failed,
        durationMs: 10_001,
        error: "command timed out after 10s"
      })
    ).toBe("Preflight check failed: command timed out after 10s");
  });
});

describe("buildPreflightFailureSyncResult", () => {
  const failure = {
    status: PkiSyncStatus.Failed as const,
    exitCode: 1,
    durationMs: 40,
    failureDetail: "/etc/ssl/certs is missing"
  };

  test("delivers nothing and reports every certificate as skipped with the reason", () => {
    const result = buildPreflightFailureSyncResult(twoCertificates, failure);

    expect(result.uploaded).toBe(0);
    expect(result.removed).toBeUndefined();
    expect(result.skipped).toBe(2);
    expect(result.details?.skippedCertificates).toEqual([
      { name: "app.example.com", reason: "Preflight check failed (exit 1): /etc/ssl/certs is missing" },
      { name: "api.example.com", reason: "Preflight check failed (exit 1): /etc/ssl/certs is missing" }
    ]);
  });

  test("carries the check result so the queue can report and audit it", () => {
    expect(buildPreflightFailureSyncResult(oneCertificate, failure).preflightCheck).toBe(failure);
  });

  test("a sync with nothing linked still reports the failure", () => {
    const result = buildPreflightFailureSyncResult({}, failure);

    expect(result.skipped).toBe(0);
    expect(result.details?.skippedCertificates).toEqual([]);
    expect(result.preflightCheck).toBe(failure);
  });
});

describe("normalizeNewPreflightCommand", () => {
  test("keeps a real command", () => {
    expect(normalizeNewPreflightCommand({ preflightCommand: "systemctl is-active nginx" })).toEqual({
      preflightCommand: "systemctl is-active nginx"
    });
  });

  test("drops a blank or absent command, so its presence is the switch", () => {
    expect(normalizeNewPreflightCommand({ preflightCommand: "" })).toEqual({});
    expect(normalizeNewPreflightCommand({ preflightCommand: null })).toEqual({});
    expect(normalizeNewPreflightCommand({ other: true })).toEqual({ other: true });
  });
});

describe("applyPreflightCommandUpdate", () => {
  const stored = "systemctl is-active nginx";

  test("an omitted key preserves the stored command", () => {
    expect(applyPreflightCommandUpdate({ exportFormat: "pem" }, stored)).toEqual({
      exportFormat: "pem",
      preflightCommand: stored
    });
  });

  test("an explicit null or a blank string clears the stored command", () => {
    expect(applyPreflightCommandUpdate({ preflightCommand: null }, stored)).toEqual({});
    expect(applyPreflightCommandUpdate({ preflightCommand: "" }, stored)).toEqual({});
  });

  test("a new command replaces the stored one", () => {
    expect(applyPreflightCommandUpdate({ preflightCommand: "test -w /srv/tls" }, stored)).toEqual({
      preflightCommand: "test -w /srv/tls"
    });
  });

  test("does not mutate the object it was given", () => {
    const input = { preflightCommand: "" };
    applyPreflightCommandUpdate(input, stored);
    expect(input).toEqual({ preflightCommand: "" });
  });
});
