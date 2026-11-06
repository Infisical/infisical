import FileSaver from "file-saver";

import {
  buildSkillZip,
  decodeSkillFile,
  getSkillEntryName,
  SKILL_ENTRY_FILE,
  SKILL_NAME_RE
} from "@app/helpers/agentVaultSkills";
import {
  TAgentVaultSkillFile,
  TAgentVaultSkillVersionWithFiles
} from "@app/hooks/api/agentVault/types";

export const downloadSkillFiles = (
  skillName: string,
  files: TAgentVaultSkillFile[],
  zipName = skillName
) => {
  const entry = files.find((file) => file.path === SKILL_ENTRY_FILE);
  const entryName = getSkillEntryName(entry && decodeSkillFile(entry));
  const folder = entryName && SKILL_NAME_RE.test(entryName) ? entryName : skillName;
  FileSaver.saveAs(
    new Blob([buildSkillZip(folder, files)], { type: "application/zip" }),
    `${zipName}.zip`
  );
};

export const downloadSkillVersion = (
  skillName: string,
  version: Pick<TAgentVaultSkillVersionWithFiles, "version" | "files">
) => downloadSkillFiles(skillName, version.files, `${skillName}-v${version.version}`);
