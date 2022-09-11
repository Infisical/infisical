const prompt = require("prompt-sync")();
const { checkAuth, checkConnect } = require("../api");
const { read, write } = require("../utilities/file");
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
			workspaceId: read(".env.infisical"),
		});
	} catch (err) {}

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
				console.log("👉 Let's get this project connected to a workspace");
				const workspaceId = prompt("Workspace ID: ");
				isConnected = await checkConnect({
					workspaceId,
				});

				if (!isConnected)
					throw new Error(
						"❌ Failed to conect to workspace with id " + workspaceId
					);
				await write({
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
