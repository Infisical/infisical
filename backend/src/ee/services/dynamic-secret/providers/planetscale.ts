import { isAxiosError } from "axios";
import RE2 from "re2";
import { z } from "zod";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { sanitizeString } from "@app/lib/fn";

import { DynamicSecretPlanetScaleSchema, TDynamicProviderFns, TDynamicProviderValidateMetadata } from "./models";
import { generateUsername } from "./templateUtils";

const PLANETSCALE_API_BASE_URL = "https://api.planetscale.com/v1";
const REQUEST_TIMEOUT_MS = 30_000;
const PLANETSCALE_NAME_INVALID_CHARS = new RE2("[^a-z0-9-]+", "g");
const PLANETSCALE_NAME_EDGE_DASHES = new RE2("^-+|-+$", "g");

type TPlanetScaleInputs = z.infer<typeof DynamicSecretPlanetScaleSchema>;
type TPlanetScalePassword = { id: string; username: string; plain_text: string; access_host_url: string };
type TPlanetScalePasswordStatus = { expired: boolean; deleted_at: string | null };
type TPlanetScaleBranch = { kind: string };

export const PlanetScaleProvider = (): TDynamicProviderFns => {
  const $parseInputs = (inputs: unknown) => DynamicSecretPlanetScaleSchema.parseAsync(inputs);

  const validateProviderInputs = async (
    inputs: object,
    { previousInputs, hasActiveLeases }: TDynamicProviderValidateMetadata
  ) => {
    const providerInputs = await $parseInputs(inputs);
    if (!hasActiveLeases || !previousInputs) return providerInputs;

    // revocation deletes each lease's password from this branch
    const previous = previousInputs as Partial<TPlanetScaleInputs>;
    const changed = (["organization", "database", "branch"] as const).find(
      (field) => previous[field] !== providerInputs[field]
    );
    if (changed) {
      throw new BadRequestError({
        message: `The ${changed} can't be changed while this dynamic secret has active leases, because revoking them needs the current value. Revoke the active leases first, then make the change.`
      });
    }
    return providerInputs;
  };

  const $requestConfig = ({ serviceTokenId, serviceToken }: TPlanetScaleInputs) => ({
    headers: {
      // every service token accepts this form, and tokens older than Bearer support accept only this one
      Authorization: `${serviceTokenId}:${serviceToken}`,
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    timeout: REQUEST_TIMEOUT_MS
  });

  const $branchUrl = ({ organization, database, branch }: TPlanetScaleInputs) =>
    `${PLANETSCALE_API_BASE_URL}/organizations/${encodeURIComponent(organization)}/databases/${encodeURIComponent(database)}/branches/${encodeURIComponent(branch)}`;

  const $passwordUrl = (providerInputs: TPlanetScaleInputs, passwordId: string) =>
    `${$branchUrl(providerInputs)}/passwords/${encodeURIComponent(passwordId)}`;

  const $toBadRequest = (err: unknown, prefix: string, providerInputs: TPlanetScaleInputs) => {
    // PlanetScale also answers 404 when the service token lacks access to the resource
    if (isAxiosError(err) && err.response?.status === 404) {
      return new BadRequestError({
        message: `${prefix}: PlanetScale couldn't find branch '${providerInputs.branch}' of database '${providerInputs.database}' in organization '${providerInputs.organization}', or the service token has no access to it.`
      });
    }
    const message =
      (isAxiosError<{ message?: string }>(err) && err.response?.data?.message) ||
      (err as Error)?.message ||
      "Unknown error";
    return new BadRequestError({
      message: `${prefix}: ${sanitizeString({ unsanitizedString: message, tokens: [providerInputs.serviceToken] })}`
    });
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await $parseInputs(inputs);
    let branch: TPlanetScaleBranch;
    try {
      ({ data: branch } = await request.get<TPlanetScaleBranch>(
        $branchUrl(providerInputs),
        $requestConfig(providerInputs)
      ));
    } catch (err) {
      throw $toBadRequest(err, "Failed to connect with PlanetScale", providerInputs);
    }
    // only Vitess (MySQL) branches have passwords; Postgres branches use roles
    if (branch.kind !== "mysql") {
      throw new BadRequestError({
        message: `PlanetScale database '${providerInputs.database}' isn't a Vitess database. The PlanetScale dynamic secret only supports Vitess databases.`
      });
    }
    return true;
  };

  const create = async ({
    inputs,
    expireAt,
    usernameTemplate,
    identity,
    dynamicSecret
  }: Parameters<TDynamicProviderFns["create"]>[0]) => {
    const providerInputs = await $parseInputs(inputs);
    // PlanetScale names only allow lowercase alphanumerics and dashes, not at either end
    const name = await generateUsername(
      usernameTemplate,
      { decryptedDynamicSecretInputs: inputs, dynamicSecret, identity },
      (username) =>
        PLANETSCALE_NAME_EDGE_DASHES.replace(PLANETSCALE_NAME_INVALID_CHARS.replace(username.toLowerCase(), "-"), "")
    );

    try {
      const { data } = await request.post<TPlanetScalePassword>(
        `${$branchUrl(providerInputs)}/passwords`,
        {
          name,
          role: providerInputs.role,
          // PlanetScale invalidates the password at the lease expiry, even if the lease revocation never runs
          ttl: Math.ceil((expireAt - Date.now()) / 1000)
        },
        // a retried POST can create a second password that no lease tracks
        { ...$requestConfig(providerInputs), "axios-retry": { retries: 0 } }
      );
      return {
        entityId: data.id,
        data: { DB_HOST: data.access_host_url, DB_USERNAME: data.username, DB_PASSWORD: data.plain_text }
      };
    } catch (err) {
      throw $toBadRequest(err, "Failed to create PlanetScale password", providerInputs);
    }
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    const providerInputs = await $parseInputs(inputs);
    const config = $requestConfig(providerInputs);
    const errorPrefix = "Failed to delete PlanetScale password";
    const isNotFound = (err: unknown) => isAxiosError(err) && err.response?.status === 404;
    try {
      await request.delete($passwordUrl(providerInputs, entityId), config);
      return { entityId };
    } catch (err) {
      if (!isNotFound(err)) throw $toBadRequest(err, errorPrefix, providerInputs);
    }

    // PlanetScale also answers 404 to a token without delete access, or one that lost access to the
    // branch, so the lease only closes once the password is known to be gone or expired
    const password = await request
      .get<TPlanetScalePasswordStatus>($passwordUrl(providerInputs, entityId), config)
      .then(({ data }) => data)
      .catch(async (err) => {
        if (!isNotFound(err)) throw $toBadRequest(err, errorPrefix, providerInputs);
        await request.get($branchUrl(providerInputs), config).catch((branchErr) => {
          throw $toBadRequest(branchErr, errorPrefix, providerInputs);
        });
        return null;
      });
    if (!password || password.expired || password.deleted_at) return { entityId };

    throw new BadRequestError({
      message:
        "Failed to delete PlanetScale password: the service token can't delete passwords on this branch. Grant it the delete_branch_password permission (delete_production_branch_password for a production branch), then revoke the lease again."
    });
  };

  const renew = async () => {
    // the password's ttl is fixed at creation, and PlanetScale's renew endpoint doesn't take a new expiry
    throw new BadRequestError({ message: "PlanetScale dynamic secret does not support renewal" });
  };

  return {
    validateProviderInputs,
    validateConnection,
    create,
    revoke,
    renew
  };
};
