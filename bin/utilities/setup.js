const prompt = require("prompt-sync")({ sigint: true });
const { checkAuth, checkConnect } = require("../api");
const { readFile, writeFile } = require("../utilities/file");
const { authenticate } = require("../utilities/auth");

/**
 * Setup prompt to ensure user is prepared
 */
const setup = async () => {
	
	let isAuthenticated;
	try {
		isAuthenticated = await checkAuth();
	} catch (err) {}

	let isConnected;
	try {
		isConnected = await checkConnect({
			workspaceId: readFile(".env.infisical"),
		});
	} catch (err) {
	}

	while (!isAuthenticated || !isConnected) {
		try {
			// ensure user is authenticated
			if (!isAuthenticated) {
				console.log("👉 Let's get you logged in.");
				const email = prompt("Email: ");
				const password = prompt("Password: ", { echo: "" });
				await authenticate({
					email,
					password,
				});
				isAuthenticated = true;
				console.log("\n");
			}

			// ensure user is connected to workspace
			if (!isConnected) {
				console.log("👉 Let's get connected to a project.");
				const workspaceId = prompt("Project ID: ");
				isConnected = await checkConnect({
					workspaceId,
				});

				if (!isConnected)
					throw new Error(
						"❌ Failed to conect to project with id " + workspaceId
					);
				await writeFile({
					fileName: ".env.infisical",
					content: workspaceId,
				});
				console.log("\n");
			}
		} catch (err) {
			console.log(err.message);
		}
	}
};

module.exports = {
	setup,
};
