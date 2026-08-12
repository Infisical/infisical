import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing #root");

// No StrictMode: it double-invokes effects, which would open the event socket twice and replay the
// whole history into the reducer twice.
createRoot(root).render(<App />);
