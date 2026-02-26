import { Helmet } from "react-helmet";

import { ObservabilityDashboard } from "./components/ObservabilityDashboard";

export const ObservabilityPage = () => {
  return (
    <>
      <Helmet>
        <title>Infisical | Observability</title>
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <div
        className="-mx-12 -mt-10 -mb-4 flex h-[calc(100%+3.5rem)] w-[calc(100%+6rem)] overflow-hidden bg-bunker-800 text-white"
        style={{ "--color-primary": "#58a6ff" } as React.CSSProperties}
      >
        <ObservabilityDashboard />
      </div>
    </>
  );
};
