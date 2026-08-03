import { describe, expect, test, vi } from "vitest";

import { PkiSyncStatus } from "./pki-sync-enums";
import {
  applyPostSyncCommandUpdate,
  buildPostSyncCommandFailureMessage,
  buildPostSyncCommandPlan,
  findSingleCertificatePostSyncCommandVariables,
  normalizeNewPostSyncCommand,
  PostSyncCommandVariable,
  renderPostSyncCommand,
  runPostSyncCommand,
  toPosixShellLiteral,
  toPowerShellLiteral,
  TPostSyncCommandContext
} from "./pki-sync-post-sync-command-fns";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

const context: TPostSyncCommandContext = {
  certificatePath: "/etc/ssl/certs/app.example.com.pem",
  certificateDirectory: "/etc/ssl/certs",
  certificateFiles: ["/etc/ssl/certs/app.example.com.pem", "/etc/ssl/certs/app.example.com.key"],
  commonName: "app.example.com"
};

describe("buildPostSyncCommandPlan", () => {
  const baseArgs = {
    command: "systemctl reload nginx",
    destinationDirectory: "/etc/ssl/certs",
    deliveredPaths: new Set(["/etc/ssl/certs/app.pem"]),
    deliveredCertificates: [{ path: "/etc/ssl/certs/app.pem", commonName: "app.example.com" }]
  };

  const twoCertificates = [
    { path: "/etc/ssl/certs/a.pem", commonName: "a.example.com" },
    { path: "/etc/ssl/certs/b.pem", commonName: "b.example.com" }
  ];

  test("returns a plan when a command is configured and files were delivered", () => {
    const plan = buildPostSyncCommandPlan(baseArgs);

    expect(plan?.command).toBe("systemctl reload nginx");
    expect(plan?.context.certificatePath).toBe("/etc/ssl/certs/app.pem");
    expect(plan?.context.certificateFiles).toEqual(["/etc/ssl/certs/app.pem"]);
  });

  test("returns undefined when no command is configured", () => {
    expect(buildPostSyncCommandPlan({ ...baseArgs, command: undefined })).toBeUndefined();
  });

  test("returns undefined when the run delivered nothing", () => {
    expect(buildPostSyncCommandPlan({ ...baseArgs, deliveredCertificates: [] })).toBeUndefined();
  });

  test("rejects a single-certificate placeholder when the run delivered several certificates", () => {
    expect(() =>
      buildPostSyncCommandPlan({
        ...baseArgs,
        command: "cp {{certificatePath}} /etc/nginx/live.pem",
        deliveredCertificates: twoCertificates
      })
    ).toThrow(/\{\{certificatePath\}\}.*delivered 2 certificates/);
  });

  test("allows run-wide placeholders for any number of certificates", () => {
    const plan = buildPostSyncCommandPlan({
      ...baseArgs,
      command: "echo {{certificateFiles}} > {{certificateDirectory}}/manifest",
      deliveredCertificates: twoCertificates
    });

    expect(plan?.command).toBe("echo {{certificateFiles}} > {{certificateDirectory}}/manifest");
  });

  test("leaves the single-certificate values unset for a multi-certificate run", () => {
    const plan = buildPostSyncCommandPlan({
      ...baseArgs,
      command: "echo {{certificateFiles}}",
      deliveredCertificates: twoCertificates
    });

    // Neither delivered certificate is promoted to stand for the run.
    expect(plan?.context.certificatePath).toBeUndefined();
    expect(plan?.context.commonName).toBeUndefined();
  });
});

describe("findSingleCertificatePostSyncCommandVariables", () => {
  test("finds the placeholders that name one certificate", () => {
    expect(findSingleCertificatePostSyncCommandVariables("cp {{certificatePath}} /tmp/{{commonName}}")).toEqual([
      PostSyncCommandVariable.CertificatePath,
      PostSyncCommandVariable.CommonName
    ]);
  });

  test("ignores placeholders that describe the whole run", () => {
    expect(findSingleCertificatePostSyncCommandVariables("echo {{certificateFiles}} {{certificateDirectory}}")).toEqual(
      []
    );
  });

  test("matches a placeholder regardless of its internal spacing", () => {
    expect(findSingleCertificatePostSyncCommandVariables("echo {{  commonName  }}")).toEqual([
      PostSyncCommandVariable.CommonName
    ]);
  });

  test("returns none for an empty command, or text that is not a placeholder", () => {
    expect(findSingleCertificatePostSyncCommandVariables()).toEqual([]);
    expect(findSingleCertificatePostSyncCommandVariables("echo {{#if")).toEqual([]);
    expect(findSingleCertificatePostSyncCommandVariables("jq {{.commonName}}")).toEqual([]);
  });
});

describe("renderPostSyncCommand", () => {
  test("substitutes each placeholder with the run's value", () => {
    const rendered = renderPostSyncCommand(
      "cp {{certificatePath}} {{certificateDirectory}}/live.pem",
      context,
      toPosixShellLiteral
    );

    expect(rendered).toBe("cp '/etc/ssl/certs/app.example.com.pem' '/etc/ssl/certs'/live.pem");
  });

  test("renders the common name and the newline-joined file list", () => {
    expect(renderPostSyncCommand("echo {{commonName}}", context, toPosixShellLiteral)).toBe("echo 'app.example.com'");
    expect(renderPostSyncCommand("echo {{certificateFiles}}", context, toPosixShellLiteral)).toBe(
      `echo '${context.certificateFiles.join("\n")}'`
    );
  });

  test("renders an absent optional variable as an empty literal rather than the placeholder", () => {
    expect(renderPostSyncCommand("echo {{pkcs12Password}}", context, toPosixShellLiteral)).toBe("echo ''");
  });

  test("quotes a value that would otherwise break out of the command", () => {
    const malicious: TPostSyncCommandContext = {
      ...context,
      commonName: "app.example.com'; rm -rf / #"
    };

    const rendered = renderPostSyncCommand("echo {{commonName}}", malicious, toPosixShellLiteral);

    // The injected quote is escaped, so the whole value stays a single argument to echo.
    expect(rendered).toBe(`echo 'app.example.com'\\''; rm -rf / #'`);
    expect(rendered.startsWith("echo '")).toBe(true);
  });

  // A common name is attacker-influenced (the import path derives it from the parsed PEM, not from a
  // validated request field), and substitution is what puts it in front of the target's shell. Each
  // payload below is a different way of ending a single-quoted literal early; a quote is the only
  // character a POSIX shell treats specially inside one, so escaping it keeps every payload inert.
  test.each([
    ["quote break-out", "app.example.com'; touch pwned; #"],
    ["command substitution", "app$(touch pwned).example.com"],
    ["backtick substitution", "app`touch pwned`.example.com"],
    ["command chaining", "app.example.com && touch pwned"],
    ["newline then a new statement", "app.example.com\ntouch pwned"],
    ["semicolon then a new statement", "app.example.com; touch pwned"],
    ["pipe to a shell", "app.example.com | sh -c 'touch pwned'"],
    // Deliberately a plain string: these exact characters are what has to reach the shell unexpanded.
    // eslint-disable-next-line no-template-curly-in-string
    ["variable expansion", "app${HOME}.example.com"]
  ])("a hostile common name (%s) stays inside one quoted literal", (_name, commonName) => {
    const rendered = renderPostSyncCommand("echo {{commonName}}", { ...context, commonName }, toPosixShellLiteral);

    // Rebuilding the literal from the value is the whole contract: any quote in it is escaped, and
    // nothing else can terminate the literal, so the shell sees exactly one argument.
    expect(rendered).toBe(`echo '${commonName.split("'").join(`'\\''`)}'`);
  });

  test("doubles quotes for PowerShell instead of backslash-escaping", () => {
    const malicious: TPostSyncCommandContext = { ...context, commonName: "a'; Remove-Item C:\\ #" };

    expect(renderPostSyncCommand("Write-Output {{commonName}}", malicious, toPowerShellLiteral)).toBe(
      "Write-Output 'a''; Remove-Item C:\\ #'"
    );
  });
});

describe("renderPostSyncCommand: text that is not a documented variable", () => {
  const render = (command: string) => renderPostSyncCommand(command, context, toPosixShellLiteral);

  test("an unknown placeholder is left exactly as the operator wrote it", () => {
    // Not blanked and not rejected: a typo shows up in the command the host runs, where the operator
    // can see it, and a brace that was never meant for us survives.
    expect(render("echo {{certPath}}")).toBe("echo {{certPath}}");
  });

  test.each([
    ["braces meant for another tool", "jq {{.name}} out.json", "jq {{.name}} out.json"],
    ["a helm value", "helm upgrade app --set x={{ .Values.x }}", "helm upgrade app --set x={{ .Values.x }}"],
    ["a block helper", '{{#with "s"}}{{constructor}}{{/with}}', '{{#with "s"}}{{constructor}}{{/with}}'],
    ["a subexpression", 'echo {{lookup (lookup this "a") "b"}}', 'echo {{lookup (lookup this "a") "b"}}'],
    ["a parent path", "echo {{../commonName}}", "echo {{../commonName}}"],
    ["a partial", "{{> somePartial}}", "{{> somePartial}}"],
    ["prototype access", "echo {{constructor.constructor}}", "echo {{constructor.constructor}}"]
  ])("%s is inert text, neither evaluated nor rejected", (_name, command, expected) => {
    expect(render(command)).toBe(expected);
  });

  test("a known variable inside unknown braces is still substituted", () => {
    // {{{x}}} is not special here, so the inner placeholder resolves and the extra braces remain.
    expect(render("echo {{{commonName}}}")).toBe("echo {'app.example.com'}");
  });

  test("a command with no placeholders is passed through untouched", () => {
    expect(render("systemctl reload nginx && echo done")).toBe("systemctl reload nginx && echo done");
  });
});

describe("runPostSyncCommand", () => {
  test("reports success on exit code 0 and captures both streams", async () => {
    const result = await runPostSyncCommand({
      syncId: "sync-id",
      execute: async () => ({ stdout: "reloaded", stderr: "a warning", exitCode: 0 })
    });

    expect(result.status).toBe(PkiSyncStatus.Succeeded);
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe("reloaded\na warning");
  });

  test("reports failure on a non-zero exit code without throwing", async () => {
    const result = await runPostSyncCommand({
      syncId: "sync-id",
      execute: async () => ({ stdout: "", stderr: "Unit nginx.service not found", exitCode: 5 })
    });

    expect(result.status).toBe(PkiSyncStatus.Failed);
    expect(result.exitCode).toBe(5);
    expect(result.error).toBe("Command exited with code 5");
  });

  test("reports failure when the transport throws", async () => {
    const result = await runPostSyncCommand({
      syncId: "sync-id",
      execute: async () => {
        throw new Error("command timed out after 30s");
      }
    });

    expect(result.status).toBe(PkiSyncStatus.Failed);
    expect(result.exitCode).toBeUndefined();
    expect(result.error).toBe("command timed out after 30s");
  });

  test("redacts the export password from captured output and errors", async () => {
    const result = await runPostSyncCommand({
      syncId: "sync-id",
      secretsToRedact: ["s3cret"],
      execute: async () => ({ stdout: "password is s3cret", stderr: "s3cret again", exitCode: 1 })
    });

    expect(result.output).not.toContain("s3cret");
    expect(result.output).toBe("password is [REDACTED]\n[REDACTED] again");
  });

  test("truncates output that exceeds the capture cap", async () => {
    const result = await runPostSyncCommand({
      syncId: "sync-id",
      execute: async () => ({ stdout: "x".repeat(5000), stderr: "", exitCode: 0 })
    });

    expect(result.output).toHaveLength(1000 + "... (truncated)".length);
    expect(result.output?.endsWith("... (truncated)")).toBe(true);
  });

  test("returns no output when the command was silent", async () => {
    const result = await runPostSyncCommand({
      syncId: "sync-id",
      execute: async () => ({ stdout: "  ", stderr: "", exitCode: 0 })
    });

    expect(result.output).toBeUndefined();
  });
});

describe("buildPostSyncCommandFailureMessage", () => {
  test("always reports the exit code and quotes stderr over stdout", () => {
    // A command that prints progress before failing must not be summarised by its progress line.
    const message = buildPostSyncCommandFailureMessage({
      status: PkiSyncStatus.Failed,
      exitCode: 1,
      durationMs: 10,
      output: "one\nCannot find any service with service name 'NoSuchSvc'.",
      failureDetail: "Cannot find any service with service name 'NoSuchSvc'.",
      error: "Command exited with code 1"
    });

    expect(message).toBe("Post-sync command failed (exit 1): Cannot find any service with service name 'NoSuchSvc'.");
  });

  test("falls back to stdout when the command wrote nothing to stderr", () => {
    const message = buildPostSyncCommandFailureMessage({
      status: PkiSyncStatus.Failed,
      exitCode: 2,
      durationMs: 10,
      output: "\n  Unit nginx.service not found\nsecond line",
      error: "Command exited with code 2"
    });

    expect(message).toBe("Post-sync command failed (exit 2): Unit nginx.service not found");
  });

  test("still reports the exit code when the command produced no output at all", () => {
    const message = buildPostSyncCommandFailureMessage({
      status: PkiSyncStatus.Failed,
      exitCode: 42,
      durationMs: 10,
      error: "Command exited with code 42"
    });

    expect(message).toBe("Post-sync command failed (exit 42): Command exited with code 42");
  });

  test("falls back to the error when the command never ran, so there is no exit code", () => {
    const message = buildPostSyncCommandFailureMessage({
      status: PkiSyncStatus.Failed,
      durationMs: 10,
      error: "Running a command on the host requires the SSH connection to use a gateway."
    });

    expect(message).toBe(
      "Post-sync command failed: Running a command on the host requires the SSH connection to use a gateway."
    );
  });

  test("truncates a long detail so it fits the sync message column", () => {
    const message = buildPostSyncCommandFailureMessage({
      status: PkiSyncStatus.Failed,
      exitCode: 3,
      durationMs: 10,
      failureDetail: "x".repeat(400),
      error: "Command exited with code 3"
    });

    expect(message.length).toBeLessThan(200);
    expect(message).toContain("(exit 3)");
    expect(message).toContain("... (truncated)");
  });

  test("a chatty command cannot bloat the stored result, which is written to the audit log", async () => {
    const noise = "N".repeat(500_000);
    const result = await runPostSyncCommand({
      syncId: "sync-id",
      execute: async () => ({ stdout: noise, stderr: noise, exitCode: 3 })
    });

    expect(result.output?.length).toBeLessThan(1100);
    expect(result.failureDetail?.length).toBeLessThanOrEqual(120);
  });
});

describe("normalizeNewPostSyncCommand", () => {
  test("keeps a real command", () => {
    expect(normalizeNewPostSyncCommand({ exportFormat: "pem", postSyncCommand: "systemctl reload nginx" })).toEqual({
      exportFormat: "pem",
      postSyncCommand: "systemctl reload nginx"
    });
  });

  test.each([
    ["null", null],
    ["empty string", ""],
    ["absent", undefined]
  ])("stores no command at all when it is %s", (_label, value) => {
    const result = normalizeNewPostSyncCommand({ exportFormat: "pem", postSyncCommand: value });

    expect("postSyncCommand" in result).toBe(false);
    expect(result).toEqual({ exportFormat: "pem" });
  });
});

describe("applyPostSyncCommandUpdate", () => {
  const stored = "systemctl reload nginx";

  test("an omitted key preserves the stored command", () => {
    const result = applyPostSyncCommandUpdate({ exportFormat: "pem", includeRootCa: true }, stored);

    expect(result.postSyncCommand).toBe(stored);
    expect(result.includeRootCa).toBe(true);
  });

  test("an explicit null clears the stored command", () => {
    const result = applyPostSyncCommandUpdate({ exportFormat: "pem", postSyncCommand: null }, stored);

    expect("postSyncCommand" in result).toBe(false);
  });

  test("a blank string clears the stored command", () => {
    const result = applyPostSyncCommandUpdate({ postSyncCommand: "" }, stored);

    expect("postSyncCommand" in result).toBe(false);
  });

  test("a new command replaces the stored one", () => {
    const result = applyPostSyncCommandUpdate({ postSyncCommand: "systemctl restart haproxy" }, stored);

    expect(result.postSyncCommand).toBe("systemctl restart haproxy");
  });

  test("an omitted key on a sync that has no command leaves it absent", () => {
    const result = applyPostSyncCommandUpdate({ exportFormat: "pem" }, undefined);

    expect("postSyncCommand" in result).toBe(false);
  });

  test("does not mutate the object it was given", () => {
    const input = { exportFormat: "pem", postSyncCommand: null };
    applyPostSyncCommandUpdate(input, stored);

    expect(input.postSyncCommand).toBeNull();
  });
});
