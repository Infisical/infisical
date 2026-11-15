import picomatch from "picomatch";

import type {
  TAccessApprovalPolicy,
  TAccessApprovalRequest
} from "@app/hooks/api/accessApproval/types";
import { isGlobSubsetOfGlob, literalPrefix } from "@app/lib/fn/glob";

export const ENTIRE_SCOPE_PATH = "/**";

export const isGlobPath = (secretPath: string) => picomatch.scan(secretPath).isGlob;

export const normalizeFolderPath = (path: string) => {
  const segments = path.trim().split("/").filter(Boolean);
  return segments.length ? `/${segments.join("/")}` : "/";
};

// The server refuses a request whose rules name different paths, so the first rule's path is the request's.
export const getRequestedSecretPath = (
  request: Pick<TAccessApprovalRequest, "permissions" | "policy">
) => {
  const glob = request.permissions?.[0]?.conditions?.secretPath?.$glob;
  return typeof glob === "string" ? glob : (request.policy.secretPath ?? "/");
};

// Mirrors resolveSecretAccessPolicyForPath on the server, so the form applies the limits of the policy that
// will own the request.
export const resolveAccessPolicyForPath = (policies: TAccessApprovalPolicy[], secretPath: string) =>
  policies
    .filter((policy) => isGlobSubsetOfGlob(policy.secretPath, secretPath))
    .sort(
      (a, b) =>
        Number(b.secretPath === secretPath) - Number(a.secretPath === secretPath) ||
        literalPrefix(b.secretPath).length - literalPrefix(a.secretPath).length ||
        Number(isGlobSubsetOfGlob(a.secretPath, b.secretPath)) -
          Number(isGlobSubsetOfGlob(b.secretPath, a.secretPath)) ||
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
        a.id.localeCompare(b.id)
    )
    .shift();

// A folder outside every policy is still offered when a covered folder sits below it, so the requester can
// drill down to a policy that only covers a nested path.
export const getNavigableFolders = (folderPaths: string[], policyPaths: string[]) => {
  const covered = folderPaths.filter((folderPath) =>
    policyPaths.some((policyPath) => isGlobSubsetOfGlob(policyPath, folderPath))
  );
  return folderPaths.filter((folderPath) =>
    covered.some((path) => path === folderPath || path.startsWith(`${folderPath}/`))
  );
};

export const getChildFolderNames = (folderPaths: string[], parentPath: string) => {
  const prefix = parentPath === "/" ? "/" : `${parentPath.replace(/\/$/, "")}/`;
  return folderPaths
    .filter((path) => path.startsWith(prefix) && path.length > prefix.length)
    .map((path) => path.slice(prefix.length))
    .filter((name) => !name.includes("/"));
};

export const getMatchingFolders = (secretPath: string, folderPaths: string[]) => {
  const isMatch = picomatch(secretPath, { strictSlashes: false });
  return folderPaths.filter((path) => isMatch(path));
};

// Compares segment by segment, so a folder sorts directly before its subfolders: comparing whole strings puts
// "/aws-prod" between "/aws" and "/aws/s3".
const compareFolderPaths = (a: string, b: string) => {
  const aSegments = a.split("/").filter(Boolean);
  const bSegments = b.split("/").filter(Boolean);
  for (let i = 0; i < Math.min(aSegments.length, bSegments.length); i += 1) {
    const order = aSegments[i].localeCompare(bSegments[i]);
    if (order) return order;
  }
  return aSegments.length - bSegments.length;
};

const isInFolder = (path: string, folder: string) =>
  folder !== "/" && path.startsWith(`${folder}/`);

export type FolderTreeNode = { path: string; label: string; children: FolderTreeNode[] };

// Puts the root first and groups before single folders. The sort is stable, so names stay in order within each.
const sortGroupsFirst = (nodes: FolderTreeNode[]) => {
  nodes.sort(
    (a, b) =>
      Number(b.path === "/") - Number(a.path === "/") ||
      Number(!a.children.length) - Number(!b.children.length)
  );
  nodes.forEach((node) => sortGroupsFirst(node.children));
  return nodes;
};

// Nests each folder under the closest listed folder above it, labelled relative to that folder. A folder whose
// parents are not listed stays at the top with its full path, so the tree never shows an unlisted parent. The
// root never holds other folders: it is a row of its own, so "/**" groups by "/aws" rather than under "/".
export const buildFolderTree = (paths: string[]) => {
  const roots: FolderTreeNode[] = [];
  const ancestors: FolderTreeNode[] = [];
  [...paths].sort(compareFolderPaths).forEach((path) => {
    while (ancestors.length && !isInFolder(path, ancestors[ancestors.length - 1].path)) {
      ancestors.pop();
    }
    const parent = ancestors[ancestors.length - 1];
    const node: FolderTreeNode = {
      path,
      label: parent ? path.slice(parent.path.length).replace(/^\//, "") : path,
      children: []
    };
    (parent ? parent.children : roots).push(node);
    ancestors.push(node);
  });
  return sortGroupsFirst(roots);
};
