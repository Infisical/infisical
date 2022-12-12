import React, { useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
const queryString = require("query-string");
import AuthorizeIntegration from "./api/integrations/authorizeIntegration";

export default function Vercel() {
  const router = useRouter();
  const parsedUrl = queryString.parse(router.asPath.split("?")[1]);
  
  /**
   * Here we forward to the default workspace if a user opens this url
   */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(async () => {
    console.log('parsedUrl, xxx', parsedUrl);
    try {
    
    } catch (err) {
        
    }
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div></div>;
}

Vercel.requireAuth = true;
