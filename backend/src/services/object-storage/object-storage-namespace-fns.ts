import RE2 from "re2";

import { ProjectType } from "@app/db/schemas";

import { TStorageNamespace } from "./object-storage-types";

const WORD_REGEX = new RE2(/^[A-Za-z0-9_-]+$/);
const ID_REGEX = new RE2(/^\{([A-Za-z][A-Za-z0-9]*)\}$/);
const FILE_SEGMENT = "{file}";

type TParsedSegment = { kind: "word"; value: string } | { kind: "id"; name: string; value: string };

const parsePath = (id: string, path: string): TParsedSegment[] =>
  path.split("/").map((part) => {
    const idMatch = ID_REGEX.exec(part);
    if (idMatch) return { kind: "id", name: idMatch[1], value: part };
    if (!WORD_REGEX.test(part)) {
      throw new Error(
        `Storage namespace "${id}": "${part}" must be a fixed word (letters, digits, - and _) or an {id}`
      );
    }
    return { kind: "word", value: part };
  });

const lastWordIndex = (segments: TParsedSegment[]) => segments.map((segment) => segment.kind).lastIndexOf("word");

export const defineStorageNamespace = ({
  id,
  product,
  path
}: {
  id: string;
  product: ProjectType;
  path: string;
}): TStorageNamespace => {
  if (!path.endsWith(`/${FILE_SEGMENT}`)) {
    throw new Error(`Storage namespace "${id}": its path must end in /${FILE_SEGMENT}`);
  }
  const segments = parsePath(id, path).slice(0, -1);
  return {
    id,
    product,
    path,
    segments: segments.map((segment) =>
      segment.kind === "word" ? { kind: "word", value: segment.value } : { kind: "id", name: segment.name }
    )
  };
};

// Rule 1: fixed words and ids take turns until the last fixed word, and only ids follow it. Otherwise an id could
// equal a fixed word, and two namespaces' files would land in one folder.
const checkTakesTurns = (namespace: TStorageNamespace) => {
  const segments = parsePath(namespace.id, namespace.path);
  const last = lastWordIndex(segments);
  if (last === -1) throw new Error(`Storage namespace "${namespace.id}" needs at least one fixed word in its path`);
  segments.forEach((segment, i) => {
    const expected = i > last || i % 2 === 1 ? "id" : "word";
    if (segment.kind !== expected) {
      throw new Error(
        `Storage namespace "${namespace.id}": "${segment.value}" is in a place where an ${expected} should be`
      );
    }
  });
};

// Rule 2: a namespace's last fixed word is its name in the path, so no other namespace of the product may use it
// anywhere, or that namespace's folder would hold the other's files.
const checkOwnLastWord = (namespaces: TStorageNamespace[]) => {
  namespaces.forEach((namespace) => {
    const segments = parsePath(namespace.id, namespace.path);
    const lastWord = segments[lastWordIndex(segments)].value;
    namespaces.forEach((other) => {
      if (other === namespace || other.product !== namespace.product) return;
      const otherWords = parsePath(other.id, other.path)
        .filter((segment) => segment.kind === "word")
        .map((segment) => segment.value);
      if (otherWords.includes(lastWord)) {
        throw new Error(`Storage namespace "${namespace.id}" ends in "${lastWord}", which "${other.id}" also uses`);
      }
    });
  });
};

export const assertNamespacesValid = (namespaces: TStorageNamespace[]) => {
  const ids = new Set<string>();
  namespaces.forEach((namespace) => {
    if (ids.has(namespace.id)) throw new Error(`Storage namespace "${namespace.id}" is registered twice`);
    ids.add(namespace.id);
    checkTakesTurns(namespace);
  });
  checkOwnLastWord(namespaces);
};
