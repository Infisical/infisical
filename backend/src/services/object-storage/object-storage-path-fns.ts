import RE2 from "re2";
import { z } from "zod";

import { TStorageNamespace } from "./object-storage-types";

const MAX_PIECE_LENGTH = 128;
const MAX_KEY_BYTES = 1024;

const ID_REGEX = new RE2(/^[A-Za-z0-9_-]+$/);
const FILE_NAME_REGEX = new RE2(/^[A-Za-z0-9._-]+$/);

// Every id and file name in a path is checked here rather than trusted: a "/" or ".." would move the object out of the
// folder the storage layer built. They come from Infisical's own code, never straight from a request, so a bad one is
// a bug, not a bad request.
export const assertSafePiece = (value: string, kind: "id" | "file") => {
  const pattern = kind === "id" ? ID_REGEX : FILE_NAME_REGEX;
  if (!value || value.length > MAX_PIECE_LENGTH || value === "." || value === ".." || !pattern.test(value)) {
    throw new Error(`Invalid object ${kind === "id" ? "id" : "name"} '${value}'`);
  }
};

const BUCKET_NAME_RULE =
  "Must be 3 to 63 characters: lowercase letters, numbers, dots and hyphens, starting and ending with a letter or number";

export const s3BucketNameSchema = z
  .string()
  .trim()
  .max(63, BUCKET_NAME_RULE)
  .regex(new RE2(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/), BUCKET_NAME_RULE);

export const isS3DirectoryBucket = (bucket: string) => bucket.endsWith("--x-s3");

// The same rules for an external bucket's key prefix and the instance's OBJECT_STORAGE_S3_PREFIX.
export const keyPrefixSchema = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `May be at most ${max} characters`)
    .regex(new RE2(/^[A-Za-z0-9!\-_.'()/]*$/), "May only contain letters, numbers and ! - _ . ' ( ) /")
    .refine(
      (v) => v === "" || v.split("/").every(Boolean),
      "Must be folder names separated by single slashes, with no slash at the start or end, like 'logs/agent-vault'"
    )
    .refine(
      (v) => !v.split("/").some((folder) => folder === "." || folder === ".."),
      "May not use '.' or '..' as a folder name"
    );

// The folder that holds every org's files in a bucket.
export const buildOrgsFolder = (prefix?: string | null) => `${prefix ? `${prefix}/` : ""}orgs/`;

export const buildProductFolder = ({
  prefix,
  orgId,
  product
}: {
  prefix?: string | null;
  orgId: string;
  product: string;
}) => {
  assertSafePiece(orgId, "id");
  return `${buildOrgsFolder(prefix)}${orgId}/${product}/`;
};

export const buildNamespaceFolder = (
  productFolder: string,
  namespace: TStorageNamespace,
  ids: Record<string, string>
) => {
  const pieces = namespace.segments.map((segment) => {
    if (segment.kind === "word") return segment.value;
    const value = Object.hasOwn(ids, segment.name) ? ids[segment.name] : undefined;
    if (value === undefined) throw new Error(`Missing '${segment.name}' for the object path`);
    assertSafePiece(value, "id");
    return value;
  });
  return `${productFolder}${pieces.join("/")}/`;
};

export const buildObjectKey = (folder: string, name: string) => {
  assertSafePiece(name, "file");
  const key = `${folder}${name}`;
  if (Buffer.byteLength(key) > MAX_KEY_BYTES) throw new Error(`The object path is longer than ${MAX_KEY_BYTES} bytes`);
  return key;
};
