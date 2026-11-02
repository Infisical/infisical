import FileSaver from "file-saver";

import {
  buildSkillZip,
  decodeSkillFile,
  getSkillEntryName,
  SKILL_ENTRY_FILE,
  SKILL_NAME_RE
} from "@app/helpers/agentVaultSkills";
import { TAgentVaultSkillVersionWithFiles } from "@app/hooks/api/agentVault/types";

export const downloadSkillVersion = (
  skillName: string,
  version: Pick<TAgentVaultSkillVersionWithFiles, "version" | "files">
) => {
  const entry = version.files.find((file) => file.path === SKILL_ENTRY_FILE);
  const entryName = getSkillEntryName(entry && decodeSkillFile(entry));
  const folder = entryName && SKILL_NAME_RE.test(entryName) ? entryName : skillName;
  FileSaver.saveAs(
    new Blob([buildSkillZip(folder, version.files)], { type: "application/zip" }),
    `${skillName}-v${version.version}.zip`
  );
};
