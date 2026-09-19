import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const runtimePackage = "release-age-fixture";
const devPackage = "release-age-dev-fixture";
const devEngines = {
  runtime: { name: "node", version: "^22.23.2", onFail: "error" },
  packageManager: { name: "npm", version: "11.19.1", onFail: "error" },
};
let registry;
let registryUrl;
const requests = [];

function tarball(name, version) {
  const files = {
    "package/package.json": JSON.stringify({
      name,
      version,
      scripts: { postinstall: "node install.cjs" },
    }),
    "package/install.cjs":
      'require("node:fs").writeFileSync("lifecycle-ran", "yes");',
  };
  const entries = Object.entries(files).flatMap(([path, contents]) => {
    const body = Buffer.from(contents);
    const header = Buffer.alloc(512);
    header.write(path, 0, 100);
    header.write("0000644\0", 100);
    header.write("0000000\0", 108);
    header.write("0000000\0", 116);
    header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124);
    header.write("00000000000\0", 136);
    header.fill(" ", 148, 156);
    header.write("0", 156);
    header.write("ustar\0", 257);
    header.write("00", 263);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148);
    return [header, body, Buffer.alloc((512 - (body.length % 512)) % 512)];
  });
  return gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)]));
}

function run(cwd, executable, ...args) {
  return new Promise((resolve) => {
    execFile(
      executable,
      args,
      {
        cwd,
        timeout: 30_000,
        env: {
          PATH: process.env.PATH,
          HOME: cwd,
          npm_config_userconfig: join(cwd, "empty-user.npmrc"),
          npm_config_globalconfig: join(cwd, "empty-global.npmrc"),
          npm_config_cache: join(cwd, "cache"),
          npm_config_registry: registryUrl,
          npm_config_audit: "false",
          npm_config_fund: "false",
          npm_config_update_notifier: "false",
          npm_config_fetch_retries: "0",
        },
      },
      (error, stdout, stderr) => {
        resolve({ code: error?.code ?? 0, stdout, stderr });
      },
    );
  });
}

const npm = (cwd, ...args) => run(cwd, "npm", ...args);

async function project(t, overrides = {}) {
  const cwd = await mkdtemp(join(tmpdir(), "node-toolchain-test-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({
      name: "toolchain-test-project",
      version: "1.0.0",
      private: true,
      devEngines,
      dependencies: { [runtimePackage]: "*" },
      ...overrides,
    }),
  );
  await writeFile(join(cwd, ".npmrc"), "min-release-age=7\n");
  return cwd;
}

async function installedVersion(cwd, name = runtimePackage) {
  return JSON.parse(
    await readFile(join(cwd, "node_modules", name, "package.json"), "utf8"),
  ).version;
}

function succeeded(result) {
  assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
}

before(async () => {
  const packages = new Map(
    [runtimePackage, devPackage].map((name) => [
      name,
      new Map(
        ["1.0.0", "1.1.0"].map((version) => [version, tarball(name, version)]),
      ),
    ]),
  );
  registry = createServer((req, res) => {
    requests.push(req.url);
    const [, name, separator, filename] = req.url.split("/");
    const versions = packages.get(name);
    if (!versions) {
      res.writeHead(404).end();
      return;
    }
    if (separator === "-") {
      const archive = versions.get(
        filename.replace(`${name}-`, "").replace(/\.tgz$/, ""),
      );
      res.writeHead(archive ? 200 : 404, {
        "content-type": "application/octet-stream",
      });
      res.end(archive);
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        name,
        "dist-tags": { latest: "1.1.0" },
        time: {
          "1.0.0": new Date(
            Date.now() - 30 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          "1.1.0": new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        },
        versions: Object.fromEntries(
          [...versions].map(([version, archive]) => [
            version,
            {
              name,
              version,
              scripts: { postinstall: "node install.cjs" },
              dist: {
                tarball: `${registryUrl}/${name}/-/${name}-${version}.tgz`,
                integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}`,
              },
            },
          ]),
        ),
      }),
    );
  });
  registry.listen(0, "127.0.0.1");
  await once(registry, "listening");
  registryUrl = `http://127.0.0.1:${registry.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) =>
    registry.close((error) => (error ? reject(error) : resolve())),
  );
});

test("regressions run with the pinned npm version", async (t) => {
  const cwd = await project(t);
  const result = await npm(cwd, "--version");
  succeeded(result);
  assert.equal(result.stdout.trim(), "11.19.1");
});

test("unlocked resolution selects an older release and permits lifecycle scripts", async (t) => {
  const cwd = await project(t);
  succeeded(await npm(cwd, "install"));
  assert.equal(await installedVersion(cwd), "1.0.0");
  assert.equal(
    await readFile(
      join(cwd, "node_modules", runtimePackage, "lifecycle-ran"),
      "utf8",
    ),
    "yes",
  );
});

test("an explicitly requested too-new release is rejected", async (t) => {
  const cwd = await project(t, { dependencies: { [runtimePackage]: "1.1.0" } });
  const result = await npm(cwd, "install");
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /ETARGET/);
  await assert.rejects(
    readFile(join(cwd, "node_modules", runtimePackage, "package.json")),
    { code: "ENOENT" },
  );
});

for (const flags of [
  [],
  ["--omit=dev"],
  ["--ignore-scripts"],
  ["--omit=dev", "--ignore-scripts"],
]) {
  test(
    `npm ci trusts too-new locked versions ${flags.join(" ")}`.trim(),
    async (t) => {
      const cwd = await project(t, {
        dependencies: { [runtimePackage]: "1.1.0" },
        devDependencies: { [devPackage]: "1.1.0" },
      });
      succeeded(
        await npm(
          cwd,
          "install",
          "--package-lock-only",
          "--min-release-age=0",
          "--ignore-scripts",
        ),
      );
      await rm(join(cwd, "cache"), { recursive: true, force: true });
      const lockfile = await readFile(join(cwd, "package-lock.json"), "utf8");
      const start = requests.length;
      succeeded(await npm(cwd, "ci", ...flags));
      assert.equal(await installedVersion(cwd), "1.1.0");
      assert.equal(
        await readFile(join(cwd, "package-lock.json"), "utf8"),
        lockfile,
      );
      assert.ok(
        requests
          .slice(start)
          .includes(`/${runtimePackage}/-/${runtimePackage}-1.1.0.tgz`),
      );
      assert.ok(!requests.slice(start).includes(`/${runtimePackage}`));
      const marker = join(cwd, "node_modules", runtimePackage, "lifecycle-ran");
      if (flags.includes("--ignore-scripts")) {
        await assert.rejects(readFile(marker), { code: "ENOENT" });
      } else {
        assert.equal(await readFile(marker, "utf8"), "yes");
      }
      if (flags.includes("--omit=dev")) {
        await assert.rejects(installedVersion(cwd, devPackage), {
          code: "ENOENT",
        });
      } else {
        assert.equal(await installedVersion(cwd, devPackage), "1.1.0");
      }
    },
  );
}

for (const engine of ["runtime", "packageManager"]) {
  for (const command of ["install", "ci"]) {
    for (const flags of [[], ["--ignore-scripts"]]) {
      test(
        `${command} rejects mismatched devEngines.${engine} before installation ${flags.join(" ")}`.trim(),
        async (t) => {
          const cwd = await project(t);
          if (command === "ci") {
            succeeded(
              await npm(
                cwd,
                "install",
                "--package-lock-only",
                "--ignore-scripts",
              ),
            );
          }
          const manifestPath = join(cwd, "package.json");
          const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
          manifest.devEngines[engine].version = "0.0.0";
          await writeFile(manifestPath, JSON.stringify(manifest));
          const start = requests.length;
          const result = await npm(cwd, command, ...flags);
          assert.notEqual(result.code, 0);
          assert.match(result.stderr, /EBADDEVENGINES/);
          assert.equal(requests.length, start);
          await assert.rejects(
            readFile(join(cwd, "node_modules", runtimePackage, "package.json")),
            { code: "ENOENT" },
          );
        },
      );
    }
  }
}

test("repository checker accepts matching pins and rejects configuration drift", async (t) => {
  const source = fileURLToPath(new URL("../", import.meta.url));
  const cwd = await mkdtemp(join(tmpdir(), "node-toolchain-checker-test-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const paths = [
    "scripts/check-node-toolchain.mjs",
    "build-versions.env",
    ".nvmrc",
    ".github/workflows",
    ".github/actions/setup-node-toolchain",
    "Dockerfile.standalone-infisical",
    "Dockerfile.fips.standalone-infisical",
    "backend/Dockerfile",
    "backend/Dockerfile.dev",
    "backend/Dockerfile.dev.fips",
    "backend/Dockerfile.fips-toolchain",
    "frontend/Dockerfile.dev",
    "docs/Dockerfile",
    ...[
      ".",
      "backend",
      "frontend",
      "e2e",
      "upgrade-impact",
      "sink/oidc-server",
    ].flatMap((directory) =>
      ["package.json", "package-lock.json", ".npmrc"].map((filename) =>
        join(directory, filename),
      ),
    ),
  ];
  await Promise.all(
    paths.map(async (path) => {
      await mkdir(dirname(join(cwd, path)), { recursive: true });
      await cp(join(source, path), join(cwd, path), { recursive: true });
    }),
  );
  const check = () =>
    run(cwd, process.execPath, "scripts/check-node-toolchain.mjs");
  await t.test("matching repository configuration passes", async () => {
    const result = await check();
    succeeded(result);
    assert.match(result.stdout, /runtime, package roots, and build pins match/);
  });
  const drifts = [
    {
      path: ".nvmrc",
      change: () => "0.0.0\n",
      expected: /\.nvmrc must match NODE_VERSION in build-versions\.env/,
    },
    {
      path: "build-versions.env",
      change: (text) => text.replace(/^NPM_VERSION=.+$/m, "NPM_VERSION=0.0.0"),
      expected: /run npm install -g npm@0\.0\.0/,
    },
    {
      path: "backend/package.json",
      change: (text) => {
        const manifest = JSON.parse(text);
        manifest.devEngines.runtime.onFail = "warn";
        return JSON.stringify(manifest);
      },
      expected:
        /backend\/package\.json: devEngines\.runtime must reject incompatible node before installation/,
    },
    {
      path: "frontend/.npmrc",
      change: (text) =>
        text.replace(/^min-release-age=7$/m, "min-release-age=0"),
      expected: /frontend\/\.npmrc must set min-release-age=7/,
    },
    {
      path: "backend/Dockerfile",
      change: (text) =>
        text.replace(/^ARG NPM_VERSION=.+$/m, "ARG NPM_VERSION=0.0.0"),
      expected:
        /backend\/Dockerfile: NPM_VERSION defaults must match build-versions\.env/,
    },
  ];
  for (const { path, change, expected } of drifts) {
    await t.test(`rejects drift in ${path}`, async (subtest) => {
      const target = join(cwd, path);
      const original = await readFile(target, "utf8");
      subtest.after(() => writeFile(target, original));
      const changed = change(original);
      assert.notEqual(changed, original);
      await writeFile(target, changed);
      const result = await check();
      assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
      assert.match(result.stderr, expected);
    });
  }
});
