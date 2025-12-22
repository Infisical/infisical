import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { setWasmUrl } from "@lottiefiles/dotlottie-react";
import lottieWasmUrl from "@lottiefiles/dotlottie-web/dist/dotlottie-player.wasm?url";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import NProgress from "nprogress";

import { Lottie } from "./components/v2";
import { queryClient } from "./hooks/api/reactQuery";
import { ErrorPage } from "./pages/public/ErrorPage/ErrorPage";
import { NotFoundPage } from "./pages/public/NotFoundPage/NotFoundPage";
// Import the generated route tree
import { routeTree } from "./routeTree.gen";

import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@xyflow/react/dist/style.css";
import "nprogress/nprogress.css";
import "react-toastify/dist/ReactToastify.css";
import "@fortawesome/fontawesome-svg-core/styles.css";
import "react-day-picker/dist/style.css";
import "./index.css";

import "./translation";
// don't want to use this?
// have a look at the Quick start guide
// for passing in lng and translations on init/

// Configure Lottie player to use local WASM file
setWasmUrl(lottieWasmUrl);

// Create a new router instance
NProgress.configure({ showSpinner: false });

window.addEventListener("vite:preloadError", async (event) => {
  event.preventDefault();
  // Get current count from session storage or initialize to 0
  const reloadCount = parseInt(sessionStorage.getItem("vitePreloadErrorCount") || "0", 10);

  // Check if we've already tried 3 times
  if (reloadCount >= 2) {
    console.warn("Vite preload has failed multiple times. Stopping automatic reload.");
    // Optionally show a user-facing message here
    return;
  }

  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch (cleanupError) {
    console.error(cleanupError);
  }
  //
  // Increment and save the counter
  sessionStorage.setItem("vitePreloadErrorCount", (reloadCount + 1).toString());

  console.log(`Reloading page (attempt ${reloadCount + 1} of 2)...`);
  window.location.reload(); // for example, refresh the page
});

const router = createRouter({
  routeTree,
  context: { serverConfig: null, queryClient },
  defaultPendingComponent: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-bunker-800">
      <Lottie isAutoPlay icon="infisical_loading" className="h-32 w-32" />
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
