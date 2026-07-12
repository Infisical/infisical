import { request } from "../config/request";

const INTEGRATION_GITHUB_API_URL = "https://api.github.com";
export type TGithubEmail = {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: null | string;
};

/**
 * Choose the email to log a GitHub user in with. A GitHub account can hold multiple emails and not
 * all of them are verified, so prefer the primary verified email, then any verified email, then the
 * primary email. Returns null when the account exposes no usable email. The returned
 * isEmailVerifiedByProvider reflects whether GitHub reports the chosen email as verified — only then
 * can we skip our own email verification.
 */
export const selectGithubLoginEmail = (emails: TGithubEmail[]) => {
  const chosen =
    emails.find((githubEmail) => githubEmail.primary && githubEmail.verified) ??
    emails.find((githubEmail) => githubEmail.verified) ??
    emails.find((githubEmail) => githubEmail.primary);

  if (!chosen?.email) return null;

  // GitHub returns verified as a real JSON boolean; compare strictly so a stray non-boolean value
  // can never be coerced into a false positive. Anything other than boolean true falls back to
  // requiring our own verification (the safe direction).
  return { email: chosen.email, isEmailVerifiedByProvider: chosen.verified === true };
};

export const fetchGithubEmails = async (accessToken: string) => {
  const { data } = await request.get<TGithubEmail[]>(`${INTEGRATION_GITHUB_API_URL}/user/emails`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  return data;
};

type TGithubUser = {
  id: number;
  name?: string;
  login: string;
};

export const fetchGithubUser = async (accessToken: string): Promise<TGithubUser> => {
  const { data } = await request.get<TGithubUser>(`${INTEGRATION_GITHUB_API_URL}/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  return data;
};
