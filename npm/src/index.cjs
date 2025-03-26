const childProcess = require("child_process");
const fs = require("fs");
const stream = require("node:stream");
const tar = require("tar");
const path = require("path");
const zlib = require("zlib");
const yauzl = require("yauzl");

const packageJSON = require("../package.json");

const supportedPlatforms = ["linux", "darwin", "win32", "freebsd", "windows"];
const outputDir = "bin";

const getPlatform = () => {
	let platform = process.platform;

	if (platform === "win32") {
		platform = "windows";
	}

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

async function extractZip(buffer, targetPath) {
	return new Promise((resolve, reject) => {
		yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
			if (err) return reject(err);

			zipfile.readEntry();
			zipfile.on("entry", entry => {
				const isExecutable = entry.fileName === "infisical" || entry.fileName === "infisical.exe";

				if (/\/$/.test(entry.fileName) || !isExecutable) {
					// Directory entry
					zipfile.readEntry();
				} else {
					// File entry
					zipfile.openReadStream(entry, (err, readStream) => {
						if (err) return reject(err);

						let fileName = entry.fileName;

						if (entry.fileName.endsWith(".exe")) {
							fileName = "infisical.exe";
						} else if (entry.fileName.includes("infisical")) {
							fileName = "infisical";
						}

						const outputPath = path.join(targetPath, fileName);
						const writeStream = fs.createWriteStream(outputPath);

						readStream.pipe(writeStream);
						writeStream.on("close", () => {
							zipfile.readEntry();
						});
					});
				}
			});

			zipfile.on("end", resolve);
			zipfile.on("error", reject);
		});
	});
}

async function main() {
	const PLATFORM = getPlatform();
	const ARCH = getArchitecture();
	const NUMERIC_RELEASE_VERSION = packageJSON.version;
	const LATEST_RELEASE_VERSION = `v${NUMERIC_RELEASE_VERSION}`;
	const EXTENSION = PLATFORM === "windows" ? "zip" : "tar.gz";
	const downloadLink = `https://github.com/Infisical/infisical/releases/download/infisical-cli/${LATEST_RELEASE_VERSION}/infisical_${NUMERIC_RELEASE_VERSION}_${PLATFORM}_${ARCH}.${EXTENSION}`;

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

		if (EXTENSION === "zip") {
			// For ZIP files, we need to buffer the whole thing first
			const buffer = await response.arrayBuffer();
			await extractZip(Buffer.from(buffer), outputDir);
		} else {
			// For tar.gz files, we stream
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
		}

		// Platform-specific tasks
		if (PLATFORM === "windows") {
			// We create an empty file called 'infisical'. This file has no functionality, except allowing NPM to correctly create the symlink.
			// Reason why this doesn't work without the empty file, is because the files downloaded are a .ps1, .exe, and .cmd file. None of these match the binary name from the package.json['bin'] field.
			// This is a bit hacky, but it assures that the symlink is correctly created.
			fs.closeSync(fs.openSync(path.join(outputDir, "infisical"), "w"));
		} else {
			// Unix systems only need chmod
			fs.chmodSync(path.join(outputDir, "infisical"), "755");
		}
	} catch (error) {
		console.error("Error downloading or extracting Infisical CLI:", error);
		process.exit(1);
	}
}
main();
