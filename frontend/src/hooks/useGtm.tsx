import { useEffect } from "react";

import { isInfisicalCloud } from "@app/helpers/platform";

const GTM_ID = "GTM-WL5C7MWT";

export const GtmHead = () => {
  const shouldLoad = isInfisicalCloud();

  useEffect(() => {
    if (!shouldLoad) return undefined;

    // If GTM was already injected by the backend (standalone mode), skip.
    // The backend injects the full GTM snippet into the static HTML <head>.
    if (window.dataLayer) return undefined;

    // Initialize dataLayer and load GTM — this is the standard GTM snippet.
    // It must run before gtm.js loads so that GA4 config commands fire correctly.
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ "gtm.start": new Date().getTime(), event: "gtm.js" });

    const firstScript = document.getElementsByTagName("script")[0];
    const gtmScript = document.createElement("script");
    gtmScript.async = true;
    gtmScript.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`;
    firstScript.parentNode?.insertBefore(gtmScript, firstScript);

    // Inject noscript iframe into body
    const noscript = document.createElement("noscript");
    noscript.id = "gtm-noscript";
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.googletagmanager.com/ns.html?id=${GTM_ID}`;
    iframe.height = "0";
    iframe.width = "0";
    iframe.style.display = "none";
    iframe.style.visibility = "hidden";
    noscript.appendChild(iframe);
    document.body.insertBefore(noscript, document.body.firstChild);

    return () => {
      gtmScript.remove();
      document.getElementById("gtm-noscript")?.remove();
    };
  }, [shouldLoad]);

  return null;
};
