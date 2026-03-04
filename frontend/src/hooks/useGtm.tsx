import { useEffect } from "react";
import { Helmet } from "react-helmet";

import { isInfisicalCloud } from "@app/helpers/platform";

const GTM_ID = "GTM-WL5C7MWT";
const GTM_NOSCRIPT_ID = "gtm-noscript";

export const GtmHead = () => {
  const shouldLoad = isInfisicalCloud();

  useEffect(() => {
    if (!shouldLoad) return undefined;

    // Inject noscript iframe into body
    const noscript = document.createElement("noscript");
    noscript.id = GTM_NOSCRIPT_ID;
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.googletagmanager.com/ns.html?id=${GTM_ID}`;
    iframe.height = "0";
    iframe.width = "0";
    iframe.style.display = "none";
    iframe.style.visibility = "hidden";
    noscript.appendChild(iframe);
    document.body.insertBefore(noscript, document.body.firstChild);

    return () => {
      document.getElementById(GTM_NOSCRIPT_ID)?.remove();
    };
  }, [shouldLoad]);

  if (!shouldLoad) return null;

  return (
    <Helmet>
      <script async src={`https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`} />
    </Helmet>
  );
};
