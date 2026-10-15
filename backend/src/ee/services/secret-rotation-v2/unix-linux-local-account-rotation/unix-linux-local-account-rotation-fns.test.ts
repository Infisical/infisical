import { Client } from "ssh2";
import { describe, expect, test, vi } from "vitest";

import {
  changeManagedPassword,
  runManagedPasswordChange,
  runSelfPasswordChange,
  runSuLoginVerification,
  TInteractiveShellStream
} from "./unix-linux-local-account-rotation-fns";

// Deliberately not credential-shaped: the handlers only ever echo these back, and the tests need
// three strings they can tell apart in the write log and look for in an error message.
const CURRENT_SENTINEL = "unit-test-sentinel-current";
const ROTATED_SENTINEL = "unit-test-sentinel-rotated";
const SUDO_SENTINEL = "unit-test-sentinel-sudo";

type TFakeStream = {
  stream: TInteractiveShellStream;
  writes: string[];
  feed: (text: string) => void;
  feedBytes: (chunk: Buffer) => void;
  close: (code?: number) => void;
};

const createFakeStream = (): TFakeStream => {
  const writes: string[] = [];
  const dataListeners: ((chunk: Buffer) => void)[] = [];
  const closeListeners: ((code?: number) => void)[] = [];

  const stream = {
    on: (event: string, listener: unknown) => {
      if (event === "data") dataListeners.push(listener as (chunk: Buffer) => void);
      if (event === "close") closeListeners.push(listener as (code?: number) => void);
    },
    write: (data: string) => {
      writes.push(data);
    },
    end: () => {}
  } as unknown as TInteractiveShellStream;

  const feedBytes = (chunk: Buffer) => dataListeners.forEach((listener) => listener(chunk));

  return {
    stream,
    writes,
    feed: (text: string) => feedBytes(Buffer.from(text, "utf8")),
    feedBytes,
    close: (code = 0) => closeListeners.forEach((listener) => listener(code))
  };
};

// Real transcripts, `\r\n` included, because the handlers read a PTY where ONLCR is on.
const LINUX_MANAGED_TRANSCRIPT = "New password: \r\nRetype new password: \r\npasswd: password updated successfully\r\n";

const AIX_MANAGED_TRANSCRIPT =
  "Changing password for \"root\"\r\nroot's New password: \r\nRe-enter root's new password: \r\n";

const SUDO_MANAGED_TRANSCRIPT =
  "[sudo] password for svc: \r\nChanging password for \"root\"\r\nroot's New password: \r\nRe-enter root's new password: \r\n";

const LINUX_SELF_TRANSCRIPT =
  "Changing password for jdoe.\r\nCurrent password: \r\nNew password: \r\nRetype new password: \r\npasswd: password updated successfully\r\n";

const driveManagedChange = (chunks: string[]) => {
  const fake = createFakeStream();
  const result = runManagedPasswordChange(fake.stream, ROTATED_SENTINEL, SUDO_SENTINEL);
  chunks.forEach((chunk) => fake.feed(chunk));
  fake.close();
  return { writes: fake.writes, result };
};

const driveSelfChange = (chunks: string[]) => {
  const fake = createFakeStream();
  const result = runSelfPasswordChange(fake.stream, CURRENT_SENTINEL, ROTATED_SENTINEL);
  chunks.forEach((chunk) => fake.feed(chunk));
  fake.close();
  return { writes: fake.writes, result };
};

const everySplitOf = (transcript: string) => {
  const splits: { offset: number; chunks: string[] }[] = [];
  for (let offset = 0; offset <= transcript.length; offset += 1) {
    splits.push({ offset, chunks: [transcript.slice(0, offset), transcript.slice(offset)] });
  }
  return splits;
};

const MANAGED_TRANSCRIPTS: [string, string, string[]][] = [
  ["Linux passwd", LINUX_MANAGED_TRANSCRIPT, [`${ROTATED_SENTINEL}\n`, `${ROTATED_SENTINEL}\n`]],
  ["AIX 7.2 passwd", AIX_MANAGED_TRANSCRIPT, [`${ROTATED_SENTINEL}\n`, `${ROTATED_SENTINEL}\n`]],
  ["sudo passwd", SUDO_MANAGED_TRANSCRIPT, [`${SUDO_SENTINEL}\n`, `${ROTATED_SENTINEL}\n`, `${ROTATED_SENTINEL}\n`]]
];

type TCommandResponse = { chunks: string[]; code?: number; error?: Error };

const createCommandClient = (responses: TCommandResponse[]) => {
  const streams: TFakeStream[] = [];
  const exec = vi.fn(
    (_command: string, _options: unknown, callback: (error: Error | null, stream: TInteractiveShellStream) => void) => {
      const response = responses[streams.length];
      if (!response) throw new Error("Unexpected SSH command");
      const fake = createFakeStream();
      streams.push(fake);
      queueMicrotask(() => {
        callback(response.error ?? null, fake.stream);
        queueMicrotask(() => {
          response.chunks.forEach((chunk) => fake.feed(chunk));
          fake.close(response.code ?? 0);
        });
      });
    }
  );
  return { client: { exec } as unknown as Client, exec, streams };
};

describe("changeManagedPassword", () => {
  test.each(["Linux", "Darwin", "SunOS"])("leaves %s rotation unchanged apart from OS detection", async (os) => {
    const { client, exec } = createCommandClient([{ chunks: [`${os}\r\n`] }, { chunks: [LINUX_MANAGED_TRANSCRIPT] }]);

    await changeManagedPassword(client, "testuser", ROTATED_SENTINEL);

    expect(exec.mock.calls.map(([command]) => command)).toEqual(["uname -s", "LC_ALL=C passwd testuser"]);
  });

  test.each([
    ["ADMCHG", "-c"],
    ["ADMIN,ADMCHG", "-f ADMIN"],
    ["ADMCHG,NOCHECK", "-f NOCHECK"],
    ["ADMIN, ADMCHG, NOCHECK", "-f ADMIN,NOCHECK"]
  ])("removes ADMCHG from '%s' without clearing other flags", async (flags, option) => {
    const { client, exec } = createCommandClient([
      { chunks: ["AIX\r\n"] },
      { chunks: [AIX_MANAGED_TRANSCRIPT] },
      { chunks: [`testuser:\r\n        lastupdate=123\r\n        flags=${flags}\r\n`] },
      { chunks: [] }
    ]);

    await changeManagedPassword(client, "testuser", ROTATED_SENTINEL);

    expect(exec.mock.calls.map(([command]) => command)).toEqual([
      "uname -s",
      "LC_ALL=C passwd testuser",
      "LC_ALL=C pwdadm -q 'testuser'",
      `LC_ALL=C pwdadm ${option} 'testuser'`
    ]);
  });

  test.each(["", "ADMIN", "NOCHECK", "ADMIN,NOCHECK"])(
    "does not modify flags when ADMCHG is absent: '%s'",
    async (flags) => {
      const { client, exec } = createCommandClient([
        { chunks: ["AIX\r\n"] },
        { chunks: [AIX_MANAGED_TRANSCRIPT] },
        { chunks: [`testuser:\r\n        flags=${flags}\r\n`] }
      ]);

      await changeManagedPassword(client, "testuser", ROTATED_SENTINEL);

      expect(exec).toHaveBeenCalledTimes(3);
    }
  );

  test("uses sudo for both pwdadm commands and answers split sudo prompts", async () => {
    const { client, exec, streams } = createCommandClient([
      { chunks: ["AIX\r\n"] },
      { chunks: [SUDO_MANAGED_TRANSCRIPT] },
      { chunks: ["[su", "do] password for svc: \r\ntestuser:\r\n        flags=ADMCHG\r\n"] },
      { chunks: ["[sudo] password for svc: "] }
    ]);

    await changeManagedPassword(client, "testuser", ROTATED_SENTINEL, true, SUDO_SENTINEL);

    expect(exec.mock.calls.map(([command]) => command)).toEqual([
      "uname -s",
      "LC_ALL=C sudo passwd testuser",
      "LC_ALL=C sudo pwdadm -q 'testuser'",
      "LC_ALL=C sudo pwdadm -c 'testuser'"
    ]);
    expect(streams[2].writes).toEqual([`${SUDO_SENTINEL}\n`]);
    expect(streams[3].writes).toEqual([`${SUDO_SENTINEL}\n`]);
  });

  test.each(["testuser:\r\n lastupdate=123\r\n", "testuser:\r\n flags=ADMCHG,UNKNOWN\r\n"])(
    "rejects unreadable or unknown flags instead of clearing them",
    async (status) => {
      const { client, exec } = createCommandClient([
        { chunks: ["AIX\r\n"] },
        { chunks: [AIX_MANAGED_TRANSCRIPT] },
        { chunks: [status] }
      ]);

      await expect(changeManagedPassword(client, "testuser", ROTATED_SENTINEL)).rejects.toThrow(/AIX password flags/);
      expect(exec).toHaveBeenCalledTimes(3);
    }
  );

  test("does not change the password if OS detection fails", async () => {
    const { client, exec } = createCommandClient([{ chunks: ["uname: not found"], code: 127 }]);

    await expect(changeManagedPassword(client, "testuser", ROTATED_SENTINEL)).rejects.toThrow(/uname -s/);
    expect(exec).toHaveBeenCalledTimes(1);
  });

  test("does not run pwdadm when the password reset fails", async () => {
    const { client, exec } = createCommandClient([{ chunks: ["AIX\r\n"] }, { chunks: ["passwd: unknown user\r\n"] }]);

    await expect(changeManagedPassword(client, "testuser", ROTATED_SENTINEL)).rejects.toThrow(/Password change failed/);
    expect(exec).toHaveBeenCalledTimes(2);
  });

  test.each([2, 3])(
    "rejects a pwdadm failure at command index %s and redacts the sudo password",
    async (failedCommand) => {
      const responses: TCommandResponse[] = [
        { chunks: ["AIX\r\n"] },
        { chunks: [SUDO_MANAGED_TRANSCRIPT] },
        { chunks: ["testuser:\r\n flags=ADMCHG\r\n"] },
        { chunks: [] }
      ];
      responses[failedCommand] = { chunks: [`${SUDO_SENTINEL}\r\nPermission denied\r\n`], code: 1 };
      const { client } = createCommandClient(responses);

      const error = await changeManagedPassword(client, "testuser", ROTATED_SENTINEL, true, SUDO_SENTINEL).catch(
        (err: unknown) => err
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("permissions");
      expect((error as Error).message).not.toContain(SUDO_SENTINEL);
    }
  );

  test("rejects a sudo password prompt for an SSH-key connection", async () => {
    const { client } = createCommandClient([
      { chunks: ["AIX\r\n"] },
      { chunks: [AIX_MANAGED_TRANSCRIPT] },
      { chunks: ["[sudo] password for svc: "] }
    ]);

    await expect(changeManagedPassword(client, "testuser", ROTATED_SENTINEL, true)).rejects.toThrow(
      /NOPASSWD for pwdadm/
    );
  });

  test("propagates SSH exec failures", async () => {
    const { client } = createCommandClient([{ chunks: [], error: new Error("channel unavailable") }]);

    await expect(changeManagedPassword(client, "testuser", ROTATED_SENTINEL)).rejects.toThrow(/channel unavailable/);
  });
});

describe("runManagedPasswordChange", () => {
  test.each(MANAGED_TRANSCRIPTS)(
    "%s: answers every prompt identically however the transcript is split",
    async (_name, transcript, expectedWrites) => {
      const runs = everySplitOf(transcript).map(({ offset, chunks }) => ({
        offset,
        ...driveManagedChange(chunks)
      }));

      await Promise.all(runs.map(({ result }) => expect(result).resolves.toBeUndefined()));

      runs.forEach(({ offset, writes }) => {
        expect(writes, `split at offset ${offset}`).toEqual(expectedWrites);
      });
    }
  );

  test.each(MANAGED_TRANSCRIPTS)(
    "%s: completes when the host coalesces the whole transcript into one chunk",
    async (_name, transcript, expectedWrites) => {
      const { writes, result } = driveManagedChange([transcript]);

      await expect(result).resolves.toBeUndefined();
      expect(writes).toEqual(expectedWrites);
    }
  );

  test("sends the new password exactly twice, never a third time", async () => {
    // AIX names the password twice ("root's New password", "Re-enter root's new password"), so an
    // unconsumed buffer would let the first prompt satisfy the confirmation as well.
    const runs = [
      driveManagedChange([AIX_MANAGED_TRANSCRIPT]),
      ...everySplitOf(AIX_MANAGED_TRANSCRIPT).map(({ chunks }) => driveManagedChange(chunks))
    ];

    await Promise.all(runs.map(({ result }) => expect(result).resolves.toBeUndefined()));

    runs.forEach(({ writes }) => {
      expect(writes.filter((write) => write === `${ROTATED_SENTINEL}\n`)).toHaveLength(2);
    });
  });

  test("rejects when the host floods the channel without a recognized prompt", async () => {
    const fake = createFakeStream();
    const result = runManagedPasswordChange(fake.stream, ROTATED_SENTINEL);

    fake.feed("motd line\r\n".repeat(7_000));

    await expect(result).rejects.toThrow(/without a recognized prompt/);
    expect(fake.writes).toEqual([]);
  });

  test("treats `passwd: password unchanged` as a failure, not a successful rotation", async () => {
    const { writes, result } = driveManagedChange([
      "New password: \r\nRetype new password: \r\n",
      "passwd: password unchanged\r\n"
    ]);

    await expect(result).rejects.toThrow(/passwd: password unchanged/);
    expect(writes).toEqual([`${ROTATED_SENTINEL}\n`, `${ROTATED_SENTINEL}\n`]);
  });

  test("reassembles a multi-byte character split across two data events", async () => {
    const fake = createFakeStream();
    const result = runManagedPasswordChange(fake.stream, ROTATED_SENTINEL);
    const banner = Buffer.from("motd: caf\u00e9\r\n", "utf8");

    fake.feedBytes(banner.subarray(0, 10));
    fake.feedBytes(banner.subarray(10));
    fake.close();

    const error = await result.catch((err: unknown) => err);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("motd: caf\u00e9");
    expect((error as Error).message).not.toContain("\ufffd");
  });

  test("redacts overlapping secrets when one password is a substring of the other", async () => {
    const shortPassword = "secret";
    const longPassword = "my-secret-value";
    const fake = createFakeStream();
    const result = runManagedPasswordChange(fake.stream, shortPassword, longPassword);

    // The sudo prompt echoes the long password (which contains the short one as a substring),
    // then the session closes without completing passwd.
    fake.feed(`[sudo] password for svc: ${longPassword}\r\n`);
    fake.feed(`New password: ${shortPassword}\r\n`);
    fake.close();

    const error = await result.catch((err: unknown) => err);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(shortPassword);
    expect((error as Error).message).not.toContain(longPassword);
  });

  test("redacts a secret split across two data events when a shorter secret overlaps", async () => {
    const shortPassword = "secret";
    const longPassword = "my-secret-value";
    const fake = createFakeStream();
    const result = runManagedPasswordChange(fake.stream, shortPassword, longPassword);

    // The network splits the echoed long password across two chunks, right
    // through the shorter secret.  An eager per-chunk redactor would replace
    // "secret" in the first chunk, leaving "-value" visible in the second.
    fake.feed("[sudo] password for svc: my-secret");
    fake.feed(`-value\r\nNew password: ${shortPassword}\r\n`);
    fake.close();

    const error = await result.catch((err: unknown) => err);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(shortPassword);
    expect((error as Error).message).not.toContain(longPassword);
    expect((error as Error).message).not.toContain("-value");
  });

  test("rejects with sudoers guidance when sudo asks for a password we do not have", async () => {
    const fake = createFakeStream();
    const result = runManagedPasswordChange(fake.stream, ROTATED_SENTINEL);

    fake.feed(SUDO_MANAGED_TRANSCRIPT);

    await expect(result).rejects.toThrow(/NOPASSWD in sudoers/);
    expect(fake.writes).toEqual([]);
  });
});

describe("runSelfPasswordChange", () => {
  test("answers every prompt identically however the transcript is split", async () => {
    const expectedWrites = [`${CURRENT_SENTINEL}\n`, `${ROTATED_SENTINEL}\n`, `${ROTATED_SENTINEL}\n`];
    const runs = everySplitOf(LINUX_SELF_TRANSCRIPT).map(({ offset, chunks }) => ({
      offset,
      ...driveSelfChange(chunks)
    }));

    await Promise.all(runs.map(({ result }) => expect(result).resolves.toBeUndefined()));

    runs.forEach(({ offset, writes }) => {
      expect(writes, `split at offset ${offset}`).toEqual(expectedWrites);
    });
  });

  test("treats `passwd: password unchanged` as a failure, not a successful rotation", async () => {
    const { writes, result } = driveSelfChange([
      "Current password: \r\nNew password: \r\nRetype new password: \r\n",
      "passwd: password unchanged\r\n"
    ]);

    await expect(result).rejects.toThrow(/passwd: password unchanged/);
    expect(writes).toEqual([`${CURRENT_SENTINEL}\n`, `${ROTATED_SENTINEL}\n`, `${ROTATED_SENTINEL}\n`]);
  });

  test("keeps passwords out of the rejection message when the tty echoes them", async () => {
    const fake = createFakeStream();
    const result = runSelfPasswordChange(fake.stream, CURRENT_SENTINEL, ROTATED_SENTINEL);

    // Echo is still on until passwd disables it, so a password written at the wrong moment comes
    // straight back and would otherwise be persisted as the rotation's last error.
    fake.feed("Current password: ");
    fake.feed(`${CURRENT_SENTINEL}\r\nNew password: `);
    fake.feed(`${ROTATED_SENTINEL}\r\n`);
    fake.close();

    const error = await result.catch((err: unknown) => err);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(CURRENT_SENTINEL);
    expect((error as Error).message).not.toContain(ROTATED_SENTINEL);
    expect((error as Error).message).toContain("***");
  });

  test("redacts a password that would straddle the 4 KiB transcript boundary", async () => {
    const fake = createFakeStream();
    const result = runSelfPasswordChange(fake.stream, CURRENT_SENTINEL, ROTATED_SENTINEL);

    // Fill the transcript so the secret sits right at the 4 KiB truncation point.
    // MAX_TRANSCRIPT_SIZE is 4096 internally; we pad with filler lines, then echo
    // the password so it would straddle the boundary if redaction happened after truncation.
    const fillerSize = 4096 - Math.floor(ROTATED_SENTINEL.length / 2);
    const filler = "x".repeat(fillerSize);

    fake.feed(filler);
    fake.feed("Current password: ");
    fake.feed(`${CURRENT_SENTINEL}\r\nNew password: `);
    fake.feed(`${ROTATED_SENTINEL}\r\n`);
    fake.close();

    const error = await result.catch((err: unknown) => err);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(CURRENT_SENTINEL);
    expect((error as Error).message).not.toContain(ROTATED_SENTINEL);
  });
});

describe("runSuLoginVerification", () => {
  test("answers a password prompt split across data events", async () => {
    const fake = createFakeStream();
    const result = runSuLoginVerification(fake.stream, "root", ROTATED_SENTINEL);

    fake.feed("Pass");
    fake.feed("word: ");
    fake.feed("\r\n[root@host ~]# ");
    fake.feed("whoami\r\nroot\r\n[root@host ~]# ");
    fake.close();

    await expect(result).resolves.toBeUndefined();
    expect(fake.writes).toEqual([`${ROTATED_SENTINEL}\n`, "whoami\n", "exit\n"]);
  });

  test("rejects on an authentication failure without leaking the password", async () => {
    const fake = createFakeStream();
    const result = runSuLoginVerification(fake.stream, "root", ROTATED_SENTINEL);

    fake.feed("Password: ");
    fake.feed(`${ROTATED_SENTINEL}\r\nsu: Authentication failure\r\n`);

    const error = await result.catch((err: unknown) => err);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/su authentication failed for user root/);
    expect((error as Error).message).not.toContain(ROTATED_SENTINEL);
  });
});
