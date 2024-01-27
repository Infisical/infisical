import { request } from "../config/request";

const INTEGRATION_GITHUB_API_URL = "https://api.github.com";
type TGithubEmail = {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: null | string;
};

export const fetchGithubEmails = async (accessToken: string) => {
  const { data } = await request.get<TGithubEmail[]>(`${INTEGRATION_GITHUB_API_URL}/user/emails`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  return data;
};
