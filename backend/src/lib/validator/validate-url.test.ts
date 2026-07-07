import { isFQDN, isValidAzureKeyVaultUrl } from "./validate-url";

describe("isFQDN", () => {
  test("Non wildcard", () => {
    expect(isFQDN("www.example.com")).toBeTruthy();
  });

  test("Wildcard", () => {
    expect(isFQDN("*.example.com", { allow_wildcard: true })).toBeTruthy();
  });

  test("Wildcard FQDN fails on option allow_wildcard false", () => {
    expect(isFQDN("*.example.com")).toBeFalsy();
  });
});

describe("isValidAzureKeyVaultUrl", () => {
  test.each([
    "https://my-vault.vault.azure.net",
    "https://my-vault.vault.azure.net/",
    "https://My-Vault.VAULT.AZURE.NET",
    "https://vault.azure.net"
  ])("accepts legitimate Azure Key Vault URL: %s", (url) => {
    expect(isValidAzureKeyVaultUrl(url)).toBe(true);
  });

  test.each([
    "https://evil.com",
    "http://my-vault.vault.azure.net",
    "https://my-vault.vault.azure.net.evil.com",
    "https://evil.com/my-vault.vault.azure.net",
    "https://vault.azure.net.evil.com",
    "https://legit.vault.azure.net@evil.com",
    "https://vault-azure-net.evil.com",
    "ftp://my-vault.vault.azure.net",
    "not-a-url",
    ""
  ])("rejects non Azure Key Vault URL: %s", (url) => {
    expect(isValidAzureKeyVaultUrl(url)).toBe(false);
  });
});
