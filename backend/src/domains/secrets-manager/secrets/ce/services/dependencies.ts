import { TReadOptions } from "@app/domains/lib/data-access";
import { TTransaction } from "@app/domains/lib/transactions";
import { TGrantActor } from "@app/domains/platform/access-control/ce/module";

import { FolderGrant } from "../models/folder-grant";
import { ServiceToken } from "../models/service-token";

// secretPath is the full path from the environment root ("/").
export type TFolderLocation = { environmentSlug: string; secretPath: string };

export type TFolderLocationStore = {
  // Same order as asked. Null if the folder is gone, in another project, or its environment is being deleted.
  findLocations(projectId: string, folderIds: string[], options?: TReadOptions): Promise<(TFolderLocation | null)[]>;
};

export type TServiceTokenStore = {
  findById(serviceTokenId: string, options?: TReadOptions): Promise<ServiceToken | null>;
};

export type TMemberNames = { users: Map<string, string>; identities: Map<string, string> };

export type TMemberNameStore = {
  // Skips ghost users (stand-ins for deleted accounts).
  findNames(input: { userIds: string[]; identityIds: string[] }, options?: TReadOptions): Promise<TMemberNames>;
};

export type TFolderGrantCache = {
  // Includes inactive grants. Served from cache while the fingerprint is unchanged.
  getOrLoad(input: {
    actor: TGrantActor;
    projectId: string;
    fingerprint: () => Promise<string>;
    load: () => Promise<FolderGrant[]>;
  }): Promise<FolderGrant[]>;
  // Fingerprint getOrLoad would serve without rechecking. Null if it would recheck (never loaded, expired, or the
  // actor needs no folder grants).
  findLiveFingerprint(input: { actor: TGrantActor; projectId: string }): Promise<string | null>;
  // Moves whenever a folder grant or the project's folder tree changes. 0 if it never moved.
  getFolderVersion(projectId: string): Promise<number>;
  // Pass `tx` so the bump commits with the change.
  bumpFolderVersions(input: { projectIds: string[]; tx?: TTransaction }): Promise<void>;
};
