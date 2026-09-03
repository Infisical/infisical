// Shared across CA types that automate DNS-01/DCV TXT records (ACME, DigiCert Services API).
export enum CaDnsProvider {
  Route53 = "route53",
  Cloudflare = "cloudflare",
  DNSMadeEasy = "dns-made-easy",
  AzureDNS = "azure-dns"
}
