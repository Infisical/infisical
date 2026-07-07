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
    "https://My-Vault.VAULT.AZURE.NET"
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
    "",
    // apex with no vault-name label is not a real data-plane endpoint
    "https://vault.azure.net",
    // empty vault-name label
    "https://.vault.azure.net",
    // custom port / path / query / fragment are not the data-plane base URL
    "https://my-vault.vault.azure.net:4443/foo",
    "https://my-vault.vault.azure.net:8443",
    "https://my-vault.vault.azure.net/certificates",
    "https://my-vault.vault.azure.net/?foo=bar",
    "https://my-vault.vault.azure.net/#frag",
    // embedded credentials
    "https://user:pass@my-vault.vault.azure.net",
    // multi-label prefix is not a valid vault name
    "https://foo.bar.vault.azure.net"
  ])("rejects non Azure Key Vault URL: %s", (url) => {
    expect(isValidAzureKeyVaultUrl(url)).toBe(false);
  });
});
