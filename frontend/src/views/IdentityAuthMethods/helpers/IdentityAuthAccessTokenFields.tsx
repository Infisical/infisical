import { IdentityAuthFieldDisplay } from "./IdentityAuthFieldDisplay";

type Props = {
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: { ipAddress: string }[];
  /** Universal Auth only — when > 0, the TTL / Max TTL fields are replaced by the period. */
  accessTokenPeriod?: number;
};

/**
 * Shared read-only display for the access-token fields every identity auth method exposes:
 * TTL, Max TTL, Max Number of Uses, and Trusted IPs. Universal Auth passes `accessTokenPeriod`
 * so the TTL / Max TTL pair is swapped for the period when one is set.
 */
export const IdentityAuthAccessTokenFields = ({
  accessTokenTTL,
  accessTokenMaxTTL,
  accessTokenNumUsesLimit,
  accessTokenTrustedIps,
  accessTokenPeriod
}: Props) => (
  <>
    {accessTokenPeriod !== undefined && Number(accessTokenPeriod) > 0 ? (
      <IdentityAuthFieldDisplay label="Access Token Period (seconds)">
        {accessTokenPeriod}
      </IdentityAuthFieldDisplay>
    ) : (
      <>
        <IdentityAuthFieldDisplay label="Access Token TTL (seconds)">
          {accessTokenTTL}
        </IdentityAuthFieldDisplay>
        <IdentityAuthFieldDisplay label="Access Token Max TTL (seconds)">
          {accessTokenMaxTTL}
        </IdentityAuthFieldDisplay>
      </>
    )}
    <IdentityAuthFieldDisplay label="Access Token Max Number of Uses">
      {accessTokenNumUsesLimit}
    </IdentityAuthFieldDisplay>
    <IdentityAuthFieldDisplay label="Access Token Trusted IPs">
      {accessTokenTrustedIps.map((ip) => ip.ipAddress).join(", ")}
    </IdentityAuthFieldDisplay>
  </>
);
