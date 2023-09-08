export interface InfisicalIgnoreFile {
  exists: boolean;
  content: string | null;
  errorMessage?: string;
}

export const checkIfInfisicalIgnoreFile = async (
  octokit: any,
  owner: string,
  repo: string
): Promise<InfisicalIgnoreFile[]> => {
  try {

    const path = ".infisicalignore";
    const fileContentsResponse = await octokit.repos.getContent({
      owner,
      repo,
      path,
    });

    const data: any = fileContentsResponse?.data;
    if (!data || !data.content) {
      return [
        {
          exists: false,
          content: null,
        },
      ];
    }
    const fileContent = Buffer.from(data.content, "base64").toString();

    return [
      {
        exists: true,
        content: fileContent,
      },
    ];
  } catch (error: any) {
    if (error.response && error.response.status === 404) {
      return [
        {
          exists: false,
          content: null,
        },
      ];
    } else {
      return [
        {
          exists: false,
          content: null,
          errorMessage: `Error checking .infisicalignore file: ${error.message}`,
        },
      ];
    }
  }
};

