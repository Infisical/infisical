import { URL } from "url"; // Import the URL class

export const getDbConnectionHost = (urlString?: string) => {
  if (!urlString) return null;

  try {
    const url = new URL(urlString);
    // Split hostname and port (if provided)
    return url.hostname.split(":")[0];
  } catch (error) {
    return null;
  }
};
