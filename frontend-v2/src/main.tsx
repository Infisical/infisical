import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import NProgress from "nprogress";

import { ContentLoader } from "./components/v2";
import { queryClient } from "./hooks/api/reactQuery";
// Import the generated route tree
import { routeTree } from "./routeTree.gen";

import "nprogress/nprogress.css";
import "react-toastify/dist/ReactToastify.css";
import "@fortawesome/fontawesome-svg-core/styles.css";
import "react-day-picker/dist/style.css";
import "./index.css";

// Create a new router instance
NProgress.configure({ showSpinner: false });

const router = createRouter({
  routeTree,
  context: { serverConfig: null, queryClient },
  defaultPendingComponent: () => (
    <div className="bg-bunker-800">
      <ContentLoader />
    </div>
  )
});

router.subscribe("onBeforeLoad", ({ pathChanged }) => {
  if (pathChanged) {
    NProgress.start();
    const timer = setTimeout(() => {
      clearTimeout(timer);
      NProgress.done();
    }, 3000);
  }
});
router.subscribe("onLoad", () => NProgress.done());
// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root")!;
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  );
}
