import { describe, expect, test } from "vitest";

import {
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
  close: () => void;
};

const createFakeStream = (): TFakeStream => {
  const writes: string[] = [];
  const dataListeners: ((chunk: Buffer) => void)[] = [];
  const closeListeners: (() => void)[] = [];

  const stream = {
    on: (event: string, listener: unknown) => {
      if (event === "data") dataListeners.push(listener as (chunk: Buffer) => void);
      if (event === "close") closeListeners.push(listener as () => void);
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
    close: () => closeListeners.forEach((listener) => listener())
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
