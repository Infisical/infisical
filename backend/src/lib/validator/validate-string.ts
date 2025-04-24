import RE2 from "re2";
import { z } from "zod";

export enum CharacterType {
  Alphabets = "alphabets",
  Numbers = "numbers",
  AlphaNumeric = "alpha-numeric",
  Spaces = "spaces",
  SpecialCharacters = "specialCharacters",
  Punctuation = "punctuation",
  Period = "period", // .
  Underscore = "underscore", // _
  Colon = "colon", // :
  ForwardSlash = "forwardSlash", // /
  Equals = "equals", // =
  Plus = "plus", // +
  Hyphen = "hyphen", // -
  At = "at", // @
  // Additional individual characters that might be useful
  Asterisk = "asterisk", // *
  Ampersand = "ampersand", // &
  Question = "question", // ?
  Hash = "hash", // #
  Percent = "percent", // %
  Dollar = "dollar", // $
  Caret = "caret", // ^
  Backtick = "backtick", // `
  Pipe = "pipe", // |
  Backslash = "backslash", // \
  OpenParen = "openParen", // (
  CloseParen = "closeParen", // )
  OpenBracket = "openBracket", // [
  CloseBracket = "closeBracket", // ]
  OpenBrace = "openBrace", // {
  CloseBrace = "closeBrace", // }
  LessThan = "lessThan", // <
  GreaterThan = "greaterThan", // >
  SingleQuote = "singleQuote", // '
  DoubleQuote = "doubleQuote", // "
  Comma = "comma", // ,
  Semicolon = "semicolon", // ;
  Exclamation = "exclamation", // !
  Fullstop = "fullStop" // .
}

/**
 * Validates if a string contains only specific types of characters
 */
export const characterValidator = (allowedCharacters: CharacterType[]) => {
  // Create a regex pattern based on allowed character types
  const patternMap: Record<CharacterType, string> = {
    [CharacterType.Alphabets]: "a-zA-Z",
    [CharacterType.Numbers]: "0-9",
    [CharacterType.AlphaNumeric]: "a-zA-Z0-9",
    [CharacterType.Spaces]: "\\s",
    [CharacterType.SpecialCharacters]: "!@#$%^&*()_+\\-=\\[\\]{}|;:'\",.<>/?\\\\",
    [CharacterType.Punctuation]: "\\.\\,\\;\\:\\!\\?",
    [CharacterType.Colon]: "\\:",
    [CharacterType.ForwardSlash]: "\\/",
    [CharacterType.Underscore]: "_",
    [CharacterType.Hyphen]: "\\-",
    [CharacterType.Period]: "\\.",
    [CharacterType.Equals]: "=",
    [CharacterType.Plus]: "\\+",
    [CharacterType.At]: "@",
    [CharacterType.Asterisk]: "\\*",
    [CharacterType.Ampersand]: "&",
    [CharacterType.Question]: "\\?",
    [CharacterType.Hash]: "#",
    [CharacterType.Percent]: "%",
    [CharacterType.Dollar]: "\\$",
    [CharacterType.Caret]: "\\^",
    [CharacterType.Backtick]: "`",
    [CharacterType.Pipe]: "\\|",
    [CharacterType.Backslash]: "\\\\",
    [CharacterType.OpenParen]: "\\(",
    [CharacterType.CloseParen]: "\\)",
    [CharacterType.OpenBracket]: "\\[",
    [CharacterType.CloseBracket]: "\\]",
    [CharacterType.OpenBrace]: "\\{",
    [CharacterType.CloseBrace]: "\\}",
    [CharacterType.LessThan]: "<",
    [CharacterType.GreaterThan]: ">",
    [CharacterType.SingleQuote]: "'",
    [CharacterType.DoubleQuote]: '\\"',
    [CharacterType.Comma]: ",",
    [CharacterType.Semicolon]: ";",
    [CharacterType.Exclamation]: "!",
    [CharacterType.Fullstop]: "."
  };

  // Combine patterns from allowed characters
  const combinedPattern = allowedCharacters.map((char) => patternMap[char]).join("");

  // Create a regex that matches only the allowed characters
  const regex = new RE2(`^[${combinedPattern}]+$`);

  /**
   * Validates if the input string contains only the allowed character types
   * @param input String to validate
   * @returns Boolean indicating if the string is valid
   */
  return function validate(input: string): boolean {
    return regex.test(input);
  };
};

export const zodValidateCharacters = (allowedCharacters: CharacterType[]) => {
  const validator = characterValidator(allowedCharacters);
  return (schema: z.ZodString, fieldName: string) => {
    return schema.refine(validator, { message: `${fieldName} can only contain ${allowedCharacters.join(",")}` });
  };
};
