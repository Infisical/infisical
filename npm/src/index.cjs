const childProcess = require("child_process");
const fs = require("fs");
const stream = require("node:stream");
const tar = require("tar");
const path = require("path");
const zlib = require("zlib");
const packageJSON = require("../package.json");

const supportedPlatforms = ["linux", "darwin", "win32", "freebsd"];
const outputDir = "bin";

const getPlatform = () => {
	const platform = process.platform;
	if (!supportedPlatforms.includes(platform)) {
		console.error("Your platform doesn't seem to be of type darwin, linux or windows");
		process.exit(1);
	}
	return platform;
};

const getArchitecture = () => {
	const architecture = process.arch;
	let arch = "";

	if (architecture === "x64" || architecture === "amd64") {
		arch = "amd64";
	} else if (architecture === "arm64") {
		arch = "arm64";
	} else if (architecture === "arm") {
		// If the platform is Linux, we should find the exact ARM version, otherwise we default to armv7 which is the most common
		if (process.platform === "linux" || process.platform === "freebsd") {
			const output = childProcess.execSync("uname -m").toString().trim();

			const armVersions = ["armv5", "armv6", "armv7"];

			const armVersion = armVersions.find(version => output.startsWith(version));

			if (armVersion) {
				arch = armVersion;
			} else {
				arch = "armv7";
			}
		} else {
			arch = "armv7";
		}
	} else if (architecture === "ia32") {
		arch = "i386";
	} else {
		console.error("Your architecture doesn't seem to be supported. Your architecture is", architecture);
		process.exit(1);
	}

	return arch;
};

async function main() {
	const PLATFORM = getPlatform();
	const ARCH = getArchitecture();
	const NUMERIC_RELEASE_VERSION = packageJSON.version;
	const LATEST_RELEASE_VERSION = `v${NUMERIC_RELEASE_VERSION}`;
	const downloadLink = `https://github.com/Infisical/infisical/releases/download/infisical-cli/${LATEST_RELEASE_VERSION}/infisical_${NUMERIC_RELEASE_VERSION}_${PLATFORM}_${ARCH}.tar.gz`;

	// Ensure the output directory exists
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir);
	}

	// Download the latest CLI binary
	try {
		const response = await fetch(downloadLink, {
			headers: {
				Accept: "application/octet-stream"
			}
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch: ${response.status} - ${response.statusText}`);
		}

		await new Promise((resolve, reject) => {
			const outStream = stream.Readable.fromWeb(response.body)
				.pipe(zlib.createGunzip())
				.pipe(
					tar.x({
						C: path.join(outputDir),
						filter: path => path === "infisical"
					})
				);

			outStream.on("error", reject);
			outStream.on("close", resolve);
		});

		// Give the binary execute permissions if we're not on Windows
		if (PLATFORM !== "win32") {
			fs.chmodSync(path.join(outputDir, "infisical"), "755");
		}
	} catch (error) {
		console.error("Error downloading or extracting Infisical CLI:", error);
		process.exit(1);
	}
}
main();
