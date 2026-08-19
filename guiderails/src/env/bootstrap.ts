import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { ApiError, InfisicalApi, type BootstrapResult } from "./api.js";
import { GUIDERAILS_ROOT } from "../paths.js";

/**
 * Brings a fresh instance to a usable state and caches the credentials.
 *
 * `POST /api/v1/admin/bootstrap` is one-shot: it throws BadRequestError once
 * serverCfg.initialized is true. So the result has to be cached, exactly as
 * backend/bdd/features/environment.py does with .bdd-infisical-bootstrap-result.json.
 * Re-running against an already-bootstrapped instance reuses the cached credentials rather
 * than failing.
 */

const STATE_FILE = path.join(GUIDERAILS_ROOT, ".guiderails-state.json");

export type InstanceState = {
  baseUrl: string;
  adminEmail: string;
  adminPassword: string;
  organizationId: string;
  organizationSlug: string;
  /** Machine identity token from bootstrap. Full admin over the API, not a browser session. */
  identityToken: string;
  bootstrappedAt: string;
};

const readState = (): InstanceState | null => {
  if (!fs.existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as InstanceState;
  } catch {
    return null;
  }
};

const writeState = (state: InstanceState): void => {
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
};

/** A password that satisfies the instance policy without being guessable across runs. */
const generatePassword = (): string =>
  `Gr${crypto.randomBytes(18).toString("base64url").replace(/[-_]/g, "")}9!`;

export type WaitOptions = {
  timeoutMs?: number;
  intervalMs?: number;
  onAttempt?: (attempt: number, elapsedMs: number) => void;
};

/**
 * Polls `GET /api/v1/admin/config` until the API answers. Matches what the BDD workflow
 * waits on, which is a stronger signal than /api/status: it proves the app booted far
 * enough to read its own config, not merely that a port is open.
 */
export const waitForInstance = async (
  baseUrl: string,
  options: WaitOptions = {}
): Promise<void> => {
  const timeoutMs = options.timeoutMs ?? 300_000;
  const intervalMs = options.intervalMs ?? 3_000;
  const api = new InfisicalApi(baseUrl);
  const started = Date.now();

  for (let attempt = 1; ; attempt += 1) {
    const elapsed = Date.now() - started;
    options.onAttempt?.(attempt, elapsed);

    try {
      await api.adminConfig();
      return;
    } catch {
      if (elapsed > timeoutMs) {
        throw new Error(
          `${baseUrl} did not become ready within ${Math.round(timeoutMs / 1000)}s. ` +
            `Check the backend logs; a FIPS image can take over two minutes to boot.`
        );
      }
      await new Promise((resolve) => {
        setTimeout(resolve, intervalMs);
      });
    }
  }
};

export type BootstrapOptions = {
  baseUrl: string;
  email?: string;
  password?: string;
  organization?: string;
  /** Ignore any cached state and bootstrap as if the instance were fresh. */
  force?: boolean;
};

export const bootstrapInstance = async (
  options: BootstrapOptions
): Promise<{ state: InstanceState; reused: boolean }> => {
  const cached = options.force ? null : readState();
  if (cached && cached.baseUrl === options.baseUrl) {
    return { state: cached, reused: true };
  }

  const api = new InfisicalApi(options.baseUrl);
  const config = await api.adminConfig();

  const email = options.email ?? "guiderails-admin@infisical-guiderails.test";
  const password = options.password ?? generatePassword();
  const organization = options.organization ?? "Guiderails";

  if (config.initialized) {
    throw new Error(
      `${options.baseUrl} is already initialized but no cached credentials were found ` +
        `(${STATE_FILE}).\n` +
        `POST /api/v1/admin/bootstrap only works once, so guiderails cannot recover the ` +
        `admin password from here. Either restore the state file, or reset the instance ` +
        `with \`guiderails env down --volumes\` followed by \`guiderails env up\`.`
    );
  }

  let result: BootstrapResult;
  try {
    result = await api.bootstrap({ email, password, organization });
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      throw new Error(
        `Bootstrap was rejected: ${error.message}\n` +
          `This usually means the instance was initialized between the config check and ` +
          `the bootstrap call.`
      );
    }
    throw error;
  }

  const state: InstanceState = {
    baseUrl: options.baseUrl,
    adminEmail: email,
    adminPassword: password,
    organizationId: result.organization.id,
    organizationSlug: result.organization.slug,
    identityToken: result.identity.credentials.token,
    bootstrappedAt: new Date().toISOString()
  };

  // Bootstrap alone does not leave a usable instance. Two gaps have to be closed before any
  // guide can be walked, and both were found by actually driving a browser at it rather than
  // by reading the bootstrap handler.
  await finishInstanceSetup(api, state);

  writeState(state);
  return { state, reused: false };
};

/**
 * Closes the gap between "bootstrap returned 200" and "a browser can reach the app".
 *
 * `super_admin.onboardingCompleted` defaults to false and bootstrap never sets it, so
 * authenticate.tsx:83 redirects every super-admin to the /admin/setup wizard. Completing it
 * over the API keeps the harness off a four-step onboarding flow that has nothing to do with
 * the guide under test.
 */
const finishInstanceSetup = async (api: InfisicalApi, state: InstanceState): Promise<void> => {
  const login = await api.login(state.adminEmail, state.adminPassword);
  const scoped = await api.selectOrganization(login.accessToken, state.organizationId);
  await api.completeOnboarding(scoped.token);
};

export const loadInstanceState = (): InstanceState => {
  const state = readState();
  if (!state) {
    throw new Error(
      `No instance state at ${STATE_FILE}. Run \`guiderails env up\` first, or ` +
        `\`guiderails env bootstrap\` against an already-running instance.`
    );
  }
  return state;
};

export const clearInstanceState = (): void => {
  if (fs.existsSync(STATE_FILE)) fs.rmSync(STATE_FILE);
};

export { STATE_FILE };
