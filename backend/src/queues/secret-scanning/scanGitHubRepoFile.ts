import { GitHubRepoFileContent } from "./types";

export const scanGitHubRepoFile = async (
  octokit: any,
  owner: string,
  repo: string,
  path: string,
): Promise<GitHubRepoFileContent[]> => {
  try {

    const fileContentsResponse = await octokit.repos.getContent({
      owner,
      repo,
      path,
    });

    const data: any = fileContentsResponse?.data;
    if (!data || !data.content) {
      return [
        {
          content: null,
        },
      ];
    }
    const fileContent = Buffer.from(data.content, "base64").toString();

    return [
      {
        content: fileContent,
      },
    ];
  } catch (error: any) {
    if (error.response && error.response.status === 404) {
      return [
        {
          content: null,
        },
      ];
    } else {
      return [
        {
          content: null,
          errorMessage: `Error checking GitHub repository file: ${repo}/${path}, ${error.message}`,
        },
      ];
    }
  }
};
