import { CharacterType, characterValidator } from "./validate-string";

describe("validate-string", () => {
  test("Check alphabets", () => {
    expect(characterValidator([CharacterType.Alphabets])("hello")).toBeTruthy();
    expect(characterValidator([CharacterType.Alphabets])("hello world")).toBeFalsy();
    expect(characterValidator([CharacterType.Alphabets, CharacterType.Spaces])("hello world")).toBeTruthy();
  });

  test("Check numbers", () => {
    expect(characterValidator([CharacterType.Numbers])("1234567890")).toBeTruthy();
    expect(characterValidator([CharacterType.AlphaNumeric])("helloWORLD1234567890")).toBeTruthy();
    expect(characterValidator([CharacterType.AlphaNumeric])("helloWORLD1234567890-")).toBeFalsy();
  });

  test("Check special characters", () => {
    expect(characterValidator([CharacterType.AlphaNumeric, CharacterType.Hyphen])("Hello-World")).toBeTruthy();
    expect(characterValidator([CharacterType.AlphaNumeric, CharacterType.Plus])("Hello+World")).toBeTruthy();
    expect(characterValidator([CharacterType.AlphaNumeric, CharacterType.Underscore])("Hello_World")).toBeTruthy();
    expect(characterValidator([CharacterType.AlphaNumeric, CharacterType.Colon])("Hello:World")).toBeTruthy();
    expect(characterValidator([CharacterType.AlphaNumeric, CharacterType.Underscore])("Hello World")).toBeFalsy();
  });
});
