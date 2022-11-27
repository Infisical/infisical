import React, { useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

import getWorkspaces from "./api/workspace/getWorkspaces";

export default function DashboardRedirect() {
  const router = useRouter();

  /**
   * Here we forward to the default workspace if a user opens this url
   */
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div></div>;
}

DashboardRedirect.requireAuth = true;
