import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import NProgress from "nprogress";

import { ContentLoader } from "./components/v2";
import { queryClient } from "./hooks/api/reactQuery";
import { ErrorPage } from "./pages/public/ErrorPage/ErrorPage";
import { NotFoundPage } from "./pages/public/NotFoundPage/NotFoundPage";
// Import the generated route tree
import { routeTree } from "./routeTree.gen";

import "nprogress/nprogress.css";
import "react-toastify/dist/ReactToastify.css";
import "@fortawesome/fontawesome-svg-core/styles.css";
import "react-day-picker/dist/style.css";
import "./index.css";

import "./translation";
// don't want to use this?
// have a look at the Quick start guide
// for passing in lng and translations on init

// Create a new router instance
NProgress.configure({ showSpinner: false });

const router = createRouter({
  routeTree,
  context: { serverConfig: null, queryClient },
  defaultPendingComponent: () => (
    <div className="bg-bunker-800">
      <ContentLoader />
    </div>
  ),
  defaultNotFoundComponent: NotFoundPage,
  defaultErrorComponent: ErrorPage
});

router.subscribe("onBeforeLoad", ({ pathChanged }) => {
  if (pathChanged) {
    NProgress.start();
    const timer = setTimeout(() => {
      clearTimeout(timer);
      NProgress.done();
    }, 2000);
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
