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

  test("Check unicode letters and digits", () => {
    const validator = characterValidator([CharacterType.UnicodeLettersAndDigits]);
    // Unicode letters
    expect(validator("hello")).toBeTruthy();
    expect(validator("你好世界")).toBeTruthy();
    expect(validator("Компания")).toBeTruthy();
    expect(validator("テスト")).toBeTruthy();
    expect(validator("شركة")).toBeTruthy();
    expect(validator("café")).toBeTruthy();
    expect(validator("München")).toBeTruthy();
    // Digits
    expect(validator("abc123")).toBeTruthy();
    // Should reject special characters
    expect(validator("hello world")).toBeFalsy();
    expect(validator("test<script>")).toBeFalsy();
    expect(validator("test()")).toBeFalsy();
  });

  test("Check unicode with additional character types", () => {
    const validator = characterValidator([
      CharacterType.UnicodeLettersAndDigits,
      CharacterType.Spaces,
      CharacterType.Period,
      CharacterType.Hyphen
    ]);
    expect(validator("My Company 公司")).toBeTruthy();
    expect(validator("Москва-Сити")).toBeTruthy();
    expect(validator("example.com")).toBeTruthy();
    expect(validator("日本語 テスト")).toBeTruthy();
    // Should still reject dangerous characters
    expect(validator("test<script>alert(1)</script>")).toBeFalsy();
  });
});
