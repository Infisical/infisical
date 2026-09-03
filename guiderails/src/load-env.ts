import path from "node:path";

import dotenv from "dotenv";

import { GUIDERAILS_ROOT } from "./paths.js";

/**
 * Side-effect module: loads `guiderails/.env` into process.env.
 *
 * Imported first in cli.ts, before any module that reads an environment variable. ESM evaluates
 * imports in source order, so a side-effect import placed above the others is the only reliable
 * way to have this run before a module-level `process.env` read elsewhere.
 *
 * Existing environment variables win, so an explicitly exported value in the shell always beats
 * the file.
 */
dotenv.config({ path: path.join(GUIDERAILS_ROOT, ".env"), override: false, quiet: true });
