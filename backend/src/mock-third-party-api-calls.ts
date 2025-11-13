import nock from "nock";

export const mockThirdPartyApiCalls = () => {
  nock("https://api.cloudflare.com:443")
    .get("/client/v4/accounts/MOCK_ACCOUNT_ID")
    .reply(200, {
      result: {
        id: "A2A6347F-88B5-442D-9798-95E408BC7701",
        name: "Mock Account",
        type: "standard",
        settings: {
          enforce_twofactor: true,
          api_access_enabled: null,
          access_approval_expiry: null,
          abuse_contact_email: null,
          user_groups_ui_beta: false
        },
        legacy_flags: {
          enterprise_zone_quota: { maximum: 0, current: 0, available: 0 }
        },
        created_on: "2013-04-18T00:41:02.215243Z"
      },
      success: true,
      errors: [],
      messages: []
    });

  nock("https://api.cloudflare.com:443")
    .get("/client/v4/zones")
    .reply(200, {
      result: [
        {
          id: "2DF47D5E-7FE2-4BD9-8503-BF27ACE6EBE5",
          name: "example.com",
          status: "active",
          paused: false,
          type: "full",
          development_mode: 0,
          name_servers: ["abby.ns.cloudflare.com", "cody.ns.cloudflare.com"],
          original_name_servers: ["ns1gmz.name.com", "ns2fgp.name.com", "ns3jwx.name.com", "ns4lny.name.com"],
          original_registrar: "name.com, inc. (id: 625)",
          original_dnshost: null,
          modified_on: "2025-11-05T18:08:57.046348Z",
          created_on: "2025-11-05T18:05:52.536690Z",
          activated_on: "2025-11-05T18:08:57.046348Z",
          vanity_name_servers: [],
          vanity_name_servers_ips: null,
          meta: {
            step: 2,
            custom_certificate_quota: 0,
            page_rule_quota: 3,
            phishing_detected: false
          },
          owner: { id: null, type: "user", email: null },
          account: {
            id: "A2A6347F-88B5-442D-9798-95E408BC7701",
            name: "Mock Account"
          },
          tenant: { id: null, name: null },
          tenant_unit: { id: null },
          permissions: ["#dns_records:edit", "#dns_records:read", "#zone:read"],
          plan: {
            id: "0feeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
            name: "Free Website",
            price: 0,
            currency: "USD",
            frequency: "",
            is_subscribed: false,
            can_subscribe: false,
            legacy_id: "free",
            legacy_discount: false,
            externally_managed: false
          }
        }
      ],
      result_info: {
        page: 1,
        per_page: 20,
        total_pages: 1,
        count: 1,
        total_count: 1
      },
      success: true,
      errors: [],
      messages: []
    });
};
