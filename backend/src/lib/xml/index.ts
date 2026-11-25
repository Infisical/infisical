import RE2 from "re2";

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
  "\r": "&#13;"
};

const XML_SPECIAL_CHARACTERS = new RE2("[&<>\"']", "g");
const XML_SPECIAL_CHARACTERS_AND_CARRIAGE_RETURN = new RE2("[&<>\"'\\r]", "g");

const XML_NAMED_ENTITIES = new RE2("&(amp|lt|gt|quot|apos);", "g");
const XML_NAMED_ENTITY_CHARACTERS: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'"
};

export const escapeXml = (value: string | number, { encodeCarriageReturn = false } = {}) =>
  String(value).replace(
    encodeCarriageReturn ? XML_SPECIAL_CHARACTERS_AND_CARRIAGE_RETURN : XML_SPECIAL_CHARACTERS,
    (character) => XML_ESCAPES[character]
  );

export const decodeXmlNamedEntities = (value: string) =>
  value.replace(XML_NAMED_ENTITIES, (entity) => XML_NAMED_ENTITY_CHARACTERS[entity]);
