import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(root, path), "utf8");
const versions = Object.fromEntries(
  read("build-versions.env")
    .split("\n")
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => line.split("=")),
);
const errors = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
};
const matchesMajorRange = (actual, minimum) => {
  const version = actual.replace(/^v/, "").split(".").map(Number);
  const floor = minimum.split(".").map(Number);
  return (
    version.length === 3 &&
    version.every(Number.isInteger) &&
    version[0] === floor[0] &&
    (version[1] > floor[1] ||
      (version[1] === floor[1] && version[2] >= floor[2]))
  );
};
const npm = execFileSync("npm", ["--version"], {
  encoding: "utf8",
  cwd: root,
}).trim();
check(
  matchesMajorRange(process.versions.node, versions.NODE_VERSION),
  `Node ${process.versions.node} is active; use Node ^${versions.NODE_VERSION} (nvm install && nvm use).`,
);
check(
  matchesMajorRange(npm, versions.NPM_VERSION),
  `npm ${npm} is active; run npm install -g npm@${versions.NPM_VERSION} or a newer npm 11 release.`,
);
check(
  read(".nvmrc").trim() === versions.NODE_VERSION,
  ".nvmrc must match NODE_VERSION in build-versions.env.",
);

const packageRoots = [
  ".",
  "frontend",
  "backend",
  "e2e",
  "upgrade-impact",
  "sink/oidc-server",
];
for (const directory of packageRoots) {
  const path = join(directory, "package.json");
  const pkg = JSON.parse(read(path));
  const lock = JSON.parse(read(join(directory, "package-lock.json")));
  const nodeRange = `^${versions.NODE_VERSION}`;
  check(
    pkg.engines?.node === nodeRange,
    `${path}: engines.node must be ${nodeRange}.`,
  );
  check(
    pkg.engines?.npm === `^${versions.NPM_VERSION}`,
    `${path}: engines.npm must accept ^NPM_VERSION.`,
  );
  check(
    pkg.packageManager === `npm@${versions.NPM_VERSION}`,
    `${path}: packageManager must match NPM_VERSION.`,
  );
  for (const [key, name, version] of [
    ["runtime", "node", nodeRange],
    ["packageManager", "npm", `^${versions.NPM_VERSION}`],
  ]) {
    const engine = pkg.devEngines?.[key];
    check(
      engine?.name === name &&
        engine?.version === version &&
        engine?.onFail === "error",
      `${path}: devEngines.${key} must reject incompatible ${name} before installation.`,
    );
  }
  check(
    JSON.stringify(lock.packages[""].engines) === JSON.stringify(pkg.engines),
    `${directory}/package-lock.json: root engines must match package.json.`,
  );
  if (directory !== "e2e") {
    const config = read(join(directory, ".npmrc"));
    check(
      /^min-release-age=7$/m.test(config),
      `${directory}/.npmrc must set min-release-age=7.`,
    );
    check(
      /^engine-strict=true$/m.test(config),
      `${directory}/.npmrc must set engine-strict=true.`,
    );
  }
}

const dockerfiles = [
  "Dockerfile.standalone-infisical",
  "Dockerfile.fips.standalone-infisical",
  "backend/Dockerfile",
  "backend/Dockerfile.dev",
  "backend/Dockerfile.dev.fips",
  "backend/Dockerfile.fips-toolchain",
  "frontend/Dockerfile.dev",
  "docs/Dockerfile",
];
for (const path of dockerfiles) {
  const text = read(path);
  if (path !== "backend/Dockerfile.dev.fips") {
    check(
      text.includes(`ARG NODE_VERSION=${versions.NODE_VERSION}\n`),
      `${path}: NODE_VERSION default must match build-versions.env.`,
    );
    check(
      !/^FROM node:(?!\$\{NODE_VERSION\})/m.test(text),
      `${path}: Node base images must use NODE_VERSION.`,
    );
  }
  const npmPins = [...text.matchAll(/^ARG NPM_VERSION=(.+)$/gm)];
  check(
    npmPins.length > 0 &&
      npmPins.every((match) => match[1] === versions.NPM_VERSION),
    `${path}: NPM_VERSION defaults must match build-versions.env.`,
  );
  check(
    path === "backend/Dockerfile.dev.fips"
      ? text.includes('RUN test "$(npm --version)" = "${NPM_VERSION}"')
      : text.includes("npm install -g npm@${NPM_VERSION}"),
    `${path}: use the pinned npm version.`,
  );
  check(
    text.includes("ENV npm_config_min_release_age=7"),
    `${path}: global installs must preserve the seven-day release window.`,
  );
  check(
    !/npm (?:i|install) -g npm@(?!\$\{NPM_VERSION\})/.test(text),
    `${path}: npm installs must use NPM_VERSION.`,
  );
}

for (const entry of readdirSync(join(root, ".github/workflows"), {
  withFileTypes: true,
})) {
  if (!entry.isFile()) continue;
  const path = join(".github/workflows", entry.name);
  check(
    !/uses: actions\/setup-node@/.test(read(path)),
    `${path}: use ./.github/actions/setup-node-toolchain so npm is pinned too.`,
  );
}

if (errors.length) {
  console.error(
    `Node/npm toolchain check failed:\n${errors.map((error) => `- ${error}`).join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `Node ${process.versions.node} / npm ${npm}: runtime, package roots, and build pins match (canonical ${versions.NODE_VERSION} / ${versions.NPM_VERSION}).`,
  );
}
