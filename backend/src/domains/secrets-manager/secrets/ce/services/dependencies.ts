import { TReadOptions } from "@app/domains/lib/data-access";
import { TTransaction } from "@app/domains/lib/transactions";
import { TGrantActor } from "@app/domains/platform/access-control/ce/module";

import { FolderGrant } from "../models/folder-grant";
import { ServiceToken } from "../models/service-token";

// Where a secret folder is: its environment's slug and its full path from the environment's root ("/").
export type TFolderLocation = { environmentSlug: string; secretPath: string };

export type TFolderLocationStore = {
  // Each folder's location, in the order asked; null for a folder that is gone, in another project, or in an
  // environment being deleted.
  findLocations(projectId: string, folderIds: string[], options?: TReadOptions): Promise<(TFolderLocation | null)[]>;
};

export type TServiceTokenStore = {
  findById(serviceTokenId: string, options?: TReadOptions): Promise<ServiceToken | null>;
};

export type TMemberNames = { users: Map<string, string>; identities: Map<string, string> };

export type TMemberNameStore = {
  // Usernames of users that are not ghosts (a ghost stands in for a deleted account) and identity names.
  findNames(input: { userIds: string[]; identityIds: string[] }, options?: TReadOptions): Promise<TMemberNames>;
};

export type TFolderGrantCache = {
  // The actor's folder grants in the project, active or not, from the cache while the fingerprint is unchanged.
  getOrLoad(input: {
    actor: TGrantActor;
    projectId: string;
    fingerprint: () => Promise<string>;
    load: () => Promise<FolderGrant[]>;
  }): Promise<FolderGrant[]>;
  // The fingerprint of the folder grants getOrLoad would serve without checking it again, or null when it would check
  // (no live marker: never loaded, expired, or the actor needs no folder grants).
  findLiveFingerprint(input: { actor: TGrantActor; projectId: string }): Promise<string | null>;
  // A counter that moves whenever a folder grant or the folder tree of the project changes; 0 when never moved.
  getFolderVersion(projectId: string): Promise<number>;
  // Moves the counter of each project, on the caller's transaction when given so it commits with the change.
  bumpFolderVersions(input: { projectIds: string[]; tx?: TTransaction }): Promise<void>;
};
