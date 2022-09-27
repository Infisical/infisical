const fs = require("fs");
const { checkConnect } = require("../api");
const { writeFile } = require("../utilities/file");

/**
 * Establish connection with workspace with id [workspaceId]. Follow steps:
 * 1. Verify user's membership with workspace
 * 2. Record workspaceId into file .env.infisical
 * @param {Object} obj
 * @param {Object} obj.workspaceId - id of workspace to connect to
 */
const connect = async ({ workspaceId }) => {
	try {
		// check workspace connection
		const isConnected = await checkConnect({ workspaceId });

		if (isConnected) {
			// create .env.infisical to store workspaceId
			await writeFile({
				fileName: ".env.infisical",
				content: workspaceId,
			});

			console.log(
				"✅ Successfully established connection with workspace " + workspaceId
			);
			process.exit(0);
		} else {
			throw new Error("Failed to connect to workspace with id " + workspaceId);
		}
	} catch (err) {
		console.error(err.message);
		process.exit(1);
	}
};

module.exports = connect;
