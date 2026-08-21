import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import argon2, { HashOptions } from "argon2";
import bcrypt from "bcrypt";

import { hasherFipsValidated } from "./crypto/cryptography/hash-fips";

const runNode = (script: string, timeout = 5_000) =>
  spawnSync(process.execPath, ["-e", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout
  });

const expectSuccessfulChild = (result: ReturnType<typeof runNode>) => {
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.status, result.stderr).toBe(0);
};

const packageDirectory = (name: string) => dirname(require.resolve(`${name}/package.json`));

const hasNativeBinary = (directory: string) =>
  existsSync(directory) && readdirSync(directory).some((file) => file.endsWith(".node"));

describe("native dependency compatibility", () => {
  test("argon2 preserves legacy encoded hashes and hashing parameters", async () => {
    // Generated with argon2 0.31.2 before the upgrade. This is the production
    // Argon2id parameter set used for legacy blind indexes and SRP key derivation.
    const password = "legacy-password-2026";
    const salt = Buffer.from("0123456789abcdef");
    const legacyEncodedHash =
      "$argon2id$v=19$m=65536,t=3,p=1$MDEyMzQ1Njc4OWFiY2RlZg$PS6NDla7Lc0ue6gkvZ2AxVwf1XQ91pbswt6YYfmhgAc";
    const legacyRawHash = "3d2e8d0e56bb2dcd2e7ba824bd9d80c55c1fd5743dd696ecc2de9861f9a18007";
    const options: HashOptions = {
      hashLength: 32,
      memoryCost: 65_536,
      parallelism: 1,
      salt,
      type: argon2.argon2id
    };

    const encodedHash = await argon2.hash(password, options);
    const normalizeParameterOrder = (hash: string) => {
      const parts = hash.split("$");
      parts[3] = parts[3].split(",").sort().join(",");
      return parts.join("$");
    };

    // argon2 0.45 serializes the same PHC parameters in a different order.
    expect(normalizeParameterOrder(encodedHash)).toBe(normalizeParameterOrder(legacyEncodedHash));
    await expect(argon2.hash(password, { ...options, raw: true })).resolves.toEqual(Buffer.from(legacyRawHash, "hex"));
    await expect(argon2.verify(legacyEncodedHash, password)).resolves.toBe(true);
    await expect(argon2.verify(legacyEncodedHash, `${password}-wrong`)).resolves.toBe(false);
    await expect(argon2.verify(encodedHash, password)).resolves.toBe(true);
  });

  test("bcrypt verifies version 5 hashes and preserves input bounds", async () => {
    // Generated with bcrypt 5.1.1 before the upgrade.
    const password = "historical-password-2026";
    const legacyHash = "$2b$12$abcdefghijklmnopqrstuu1r4Y6LKcFVkL//bPzQls38Y12dd/e8u";

    await expect(bcrypt.compare(password, legacyHash)).resolves.toBe(true);
    await expect(bcrypt.compare(`${password}-wrong`, legacyHash)).resolves.toBe(false);
    expect(bcrypt.getRounds(legacyHash)).toBe(12);

    await expect(bcrypt.genSalt(3)).resolves.toMatch(/^\$2b\$04\$/);
    await expect(bcrypt.genSalt(32)).resolves.toMatch(/^\$2b\$31\$/);

    const seventyTwoBytes = "a".repeat(72);
    const boundaryHash = bcrypt.hashSync(seventyTwoBytes, "$2b$04$abcdefghijklmnopqrstuu");
    expect(bcrypt.compareSync(`${seventyTwoBytes}ignored-after-byte-72`, boundaryHash)).toBe(true);
    expect(bcrypt.compareSync(`${"a".repeat(71)}b`, boundaryHash)).toBe(false);
  });

  test("keeps FIPS password hashes on the PBKDF2 path", async () => {
    const password = "fips-password-2026";
    const fipsHasher = hasherFipsValidated();
    const hash = await fipsHasher.hash(password, 10);

    expect(hash).toMatch(/^\$v1\$10\$/);
    await expect(fipsHasher.compare(password, hash)).resolves.toBe(true);
    await expect(fipsHasher.compare(`${password}-wrong`, hash)).resolves.toBe(false);
    await expect(
      fipsHasher.compare(password, "$2b$12$abcdefghijklmnopqrstuu1r4Y6LKcFVkL//bPzQls38Y12dd/e8u")
    ).resolves.toBe(false);
  });

  test("RE2 handles security regression inputs without hanging, crashing, or disclosing bytes", () => {
    const result = runNode(String.raw`
      const assert = require("node:assert/strict");
      const RE2 = require("re2");

      assert.deepEqual("".match(new RE2("a*", "g")), [""]);

      const outOfRange = new RE2("x", "g");
      outOfRange.lastIndex = 10;
      assert.equal(outOfRange.test("é"), false);
      assert.equal(outOfRange.lastIndex, 0);

      const truncated = Buffer.from([0x61, 0xe2, 0x82]);
      assert.deepEqual(new RE2(Buffer.from("a"), "g").replace(truncated, Buffer.from("b")),
        Buffer.from([0x62, 0xe2, 0x82]));
      assert.deepEqual(new RE2(Buffer.from("a")).split(truncated),
        [Buffer.alloc(0), Buffer.from([0xe2, 0x82])]);
      assert.deepEqual(new RE2(Buffer.from("a")).replace(Buffer.from("a"), Buffer.from([0x62, 0xe2, 0x82])),
        Buffer.from([0x62, 0xe2, 0x82]));
      assert.throws(() => new RE2(Buffer.from([0x61, 0xe2, 0x82])), SyntaxError);

      assert.equal("abba".replace(new RE2("(b+)", "g"), "<$1>"), "a<bb>a");
      assert.equal(new RE2("^(a+)+$").test("a".repeat(100_000) + "!"), false);
      assert.equal(new RE2("(?<word>\\p{L}+)", "u").exec("秘密").groups.word, "秘密");
      assert.throws(() => new RE2("(?=a)"), SyntaxError);
      assert.throws(() => new RE2("(a)\\1"), SyntaxError);
    `);

    expectSuccessfulChild(result);
  });

  test("tar extraction rejects a drive-relative hardlink escape", () => {
    const result = runNode(`
      const assert = require("node:assert/strict");
      const fs = require("node:fs");
      const os = require("node:os");
      const path = require("node:path");
      const { Header, x } = require("tar");

      (async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "infisical-tar-traversal-"));
        try {
          const extractionDirectory = path.join(root, "extract");
          const outsideTarget = path.join(root, "target.txt");
          const archive = path.join(root, "payload.tar");
          fs.mkdirSync(extractionDirectory);
          fs.writeFileSync(outsideTarget, "ORIGINAL");

          const payload = Buffer.alloc(1536);
          new Header({
            path: "link",
            type: "Link",
            linkpath: "C:../target.txt",
            mode: 0o644,
            uid: 0,
            gid: 0,
            size: 0,
            mtime: new Date(0)
          }).encode(payload, 0);
          fs.writeFileSync(archive, payload);

          await x({ cwd: extractionDirectory, file: archive });
          assert.equal(fs.existsSync(path.join(extractionDirectory, "link")), false);
          assert.equal(fs.readFileSync(outsideTarget, "utf8"), "ORIGINAL");
        } finally {
          fs.rmSync(root, { recursive: true, force: true });
        }
      })().catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
    `);

    expectSuccessfulChild(result);
  });

  test("ships native artifacts for the supported Linux architectures", () => {
    for (const dependency of ["argon2", "bcrypt"]) {
      const prebuilds = join(packageDirectory(dependency), "prebuilds");
      expect(hasNativeBinary(join(prebuilds, "linux-x64"))).toBe(true);
      expect(hasNativeBinary(join(prebuilds, "linux-arm64"))).toBe(true);
    }

    const odbcPackage = JSON.parse(readFileSync(join(packageDirectory("odbc"), "package.json"), "utf8")) as {
      binary: { module_path: string; napi_versions: number[] };
    };
    expect(odbcPackage.binary).toMatchObject({ module_path: "./lib/bindings/napi-v{napi_build_version}" });
    expect(odbcPackage.binary.napi_versions).toContain(8);
    expect(existsSync(join(packageDirectory("odbc"), "lib", "bindings", "napi-v8", "odbc.node"))).toBe(true);
  });
});
