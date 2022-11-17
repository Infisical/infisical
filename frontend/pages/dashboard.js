import React, { useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

import getWorkspaces from "./api/workspace/getWorkspaces";

export default function DashboardRedirect() {
	const router = useRouter();

	/**
	 * Here we forward to the default workspace if a user opens this url
	 */
	useEffect(async () => {
		let userWorkspace;
		try {
			if (localStorage.getItem("projectData.id")) {
				router.push("/dashboard/" + localStorage.getItem("projectData.id"));
			} else {
				const userWorkspaces = await getWorkspaces();
				userWorkspace = userWorkspaces[0]._id;
				router.push("/dashboard/" + userWorkspace);
			}
		} catch (error) {
			console.log("Error - Not logged in yet");
		}
	}, []);

	return <div></div>
}

DashboardRedirect.requireAuth = true;
