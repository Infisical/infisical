import { TFolderLocation, TFolderLocationStore } from "../services/dependencies";

export class InMemoryFolderLocationStore implements TFolderLocationStore {
  readonly folders = new Map<string, TFolderLocation & { projectId: string }>();

  async findLocations(projectId: string, folderIds: string[]): Promise<(TFolderLocation | null)[]> {
    return folderIds.map((folderId) => {
      const folder = this.folders.get(folderId);
      if (!folder || folder.projectId !== projectId) return null;
      return { environmentSlug: folder.environmentSlug, secretPath: folder.secretPath };
    });
  }
}
