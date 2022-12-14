import React, { useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
const queryString = require("query-string");
import AuthorizeIntegration from "./api/integrations/authorizeIntegration";

export default function Netlify() {
  const router = useRouter();
  const parsedUrl = queryString.parse(router.asPath.split("?")[1]);
  const code = parsedUrl.code;
  const state = parsedUrl.state;
  // modify comment here
  
  /**
   * Here we forward to the default workspace if a user opens this url
   */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(async () => {
    if (state === localStorage.getItem('latestCSRFToken')) {
      localStorage.removeItem('latestCSRFToken');
        
      // http://localhost:8080/netlify?code=qnG0g_krhklWDpdUqfhU-t1sLeZzYI3gF2d6QVnL-Gc&state=3a78cd3154a9a99ddd4eb5d99dbb3289
      // http://localhost:8080/netlify#access_token=d-78qUAnnSzvlgfG9Y_oUV6_4TQBxLbofImiBbKAjzE&token_type=Bearer&state=5da34fa49e301e9fa1a6e40925694b77
      
      await AuthorizeIntegration({
        workspaceId: localStorage.getItem('projectData.id'),
        code,
        integration: "netlify"
      });
      
    //   router.push("/integrations/" + localStorage.getItem("projectData.id"));
    }

    try {
  
    } catch (err) {
      console.error('Netlify integration error: ', err);
    }
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div></div>;
}

Netlify.requireAuth = true;
