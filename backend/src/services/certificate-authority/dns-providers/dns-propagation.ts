import dns from "dns";
import RE2 from "re2";

import { delay } from "@app/lib/delay";

const DNS_PROPAGATION_MAX_RETRIES = 5;
const DNS_PROPAGATION_INTERVAL_MS = 2000;

/**
 * Polls public DNS for a TXT record at `lookupName` matching `expectedValue`.
 * Returns whether it was observed within the retry budget — callers that can't
 * block on propagation (e.g. an async CA order that's re-checked by a poller
 * anyway) should treat a `false` result as informational, not fatal.
 */
export const waitForTxtRecordPropagation = async (
  lookupName: string,
  expectedValue: string,
  dnsResolver?: string
): Promise<boolean> => {
  const unquotedExpected = expectedValue.replace(new RE2('^"|"$', "g"), "");
  let attempts = 0;

  const resolver = new dns.promises.Resolver();
  if (dnsResolver) {
    resolver.setServers([dnsResolver]);
  }

  while (attempts < DNS_PROPAGATION_MAX_RETRIES) {
    attempts += 1;

    const found = await resolver // eslint-disable-line no-await-in-loop
      .resolveTxt(lookupName)
      .then((records) => records.some((chunks) => chunks.join("") === unquotedExpected))
      .catch(() => false);

    if (found) return true;

    if (attempts < DNS_PROPAGATION_MAX_RETRIES) {
      await delay(DNS_PROPAGATION_INTERVAL_MS); // eslint-disable-line no-await-in-loop
    }
  }

  return false;
};
