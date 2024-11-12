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
	const architecture = childProcess.execSync("uname -m").toString().trim();
	let arch = "";
	if (architecture === "x86_64" || architecture === "amd64") {
		arch = "amd64";
	} else if (architecture === "arm64" || architecture === "aarch64") {
		arch = "arm64";
	} else if (architecture.startsWith("armv5")) {
		arch = "armv5";
	} else if (architecture.startsWith("armv6")) {
		arch = "armv6";
	} else if (architecture.startsWith("armv7")) {
		arch = "armv7";
	} else if (architecture === "i386" || architecture === "i686") {
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

		return await new Promise((resolve, reject) => {
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
	} catch (error) {
		console.error("Error downloading or extracting Infisical CLI:", error);
		process.exit(1);
	}
}
main();
