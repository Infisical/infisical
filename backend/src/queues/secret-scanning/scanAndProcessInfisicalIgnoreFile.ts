import GitRisks, { RiskStatus } from "../../ee/models/gitRisks";
import { scanGitHubRepoFile } from "./scanGitHubRepoFile";
import { GitHubRepoFileContent } from "./types";

const INFISICAL_IGNORE_FILE_PATH = ".infisicalignore"; // ie. at base of repo

export const scanAndProcessInfisicalIgnoreFile = async (
  octokit: any,
  owner: string,
  repo: string,
  existingUnresolvedFingerprints?: string[]
): Promise<number> => {

  // get the .infisicalignore file contents
  const path = INFISICAL_IGNORE_FILE_PATH;
  const infisicalIgnoreFileContents: GitHubRepoFileContent[] = await scanGitHubRepoFile(octokit, owner, repo, path);

  if (infisicalIgnoreFileContents.length === 0) {
    // No .infisicalignore file found or it's empty
    return 0;
  }

  // Extract fingerprints from .infisicalignore file
  const ignoreFileFingerprints: string[] = [];
  const newInfisicalIgnoreFindingsToUpdate: string[] = [];

  for (const infisicalIgnoreFingerprint of infisicalIgnoreFileContents) {
    const content = infisicalIgnoreFingerprint.content;
    if (content) {
      const fingerprints = content.split("\n");
      ignoreFileFingerprints.push(...fingerprints);
    }
  }

  // Check if the ignore file fingerprints match existing unresolved fingerprints
  for (const ignoreFileFingerprint of ignoreFileFingerprints) {
    // for scan of new pushes
    if (existingUnresolvedFingerprints?.includes(ignoreFileFingerprint)) {
      newInfisicalIgnoreFindingsToUpdate.push(ignoreFileFingerprint);
      // for historical full repo scan
    } else if (existingUnresolvedFingerprints === undefined) {
      newInfisicalIgnoreFindingsToUpdate.push(ignoreFileFingerprint);
    }
  }

  // Batch update found .infisicalignore findings (to false positives)
  for (const processedFingerprint of newInfisicalIgnoreFindingsToUpdate) {
    await GitRisks.findOneAndUpdate(
      { fingerprint: processedFingerprint },
      { status: RiskStatus.RESOLVED_FALSE_POSITIVE },
      { upsert: true }
    ).lean();
  }

  return newInfisicalIgnoreFindingsToUpdate.length;
}