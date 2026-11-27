import { FolderAccessChangeSource } from "@app/lib/analytics";

export type TFolderAccessSectionActor =
  | {
      type: "user";
      id: string;
      membershipId: string | null;
      username: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
    }
  | {
      type: "identity";
      id: string;
      name: string;
    };

export const folderAccessChangeSourceOf = (
  actor: TFolderAccessSectionActor
): FolderAccessChangeSource =>
  actor.type === "user" ? "access_control_member" : "access_control_identity";
