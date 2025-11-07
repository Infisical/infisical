Feature: Account

  Scenario: Create a new account
    Given I have an ACME cert profile as "acme_profile"
    When I have an ACME client connecting to {BASE_URL}/api/v1/pki/acme/profiles/{acme_profile.id}/directory
    Then I register a new ACME account with email fangpen@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as acme_account
    Then the value acme_account.uri with jq "." should match pattern {BASE_URL}/api/v1/pki/acme/profiles/{acme_profile.id}/accounts/(.+)

  Scenario: Create a new account without EAB
    Given I have an ACME cert profile as "acme_profile"
    When I have an ACME client connecting to {BASE_URL}/api/v1/pki/acme/profiles/{acme_profile.id}/directory
    Then I register a new ACME account with email fangpen@infisical.com without EAB
    Then the value error with jq ".type" should be equal to "urn:ietf:params:acme:error:externalAccountRequired"

  Scenario Outline: Scenario: Create a new account with bad EAB credentials
    Given I have an ACME cert profile as "acme_profile"
    When I have an ACME client connecting to {BASE_URL}/api/v1/pki/acme/profiles/{acme_profile.id}/directory
    Then I register a new ACME account with email fangpen@infisical.com and EAB key id "<eab_kid>" with secret "<eab_secret>" as acme_account
    Then the value error with jq ".type" should be equal to "<error_type>"
    Then the value error with jq ".detail" should be equal to "<error_msg>"

    Examples: Bad Credentials
      | eab_kid                              | eab_secret                | error_type                                         | error_msg |
      | bad                                  | Cg==                      | urn:ietf:params:acme:error:externalAccountRequired | fixme     |
      | bad                                  | Cg==                      | urn:ietf:params:acme:error:externalAccountRequired | fixme     |
      | {acme_profile.eab_kid}               | Cg==                      | urn:ietf:params:acme:error:externalAccountRequired | fixme     |
      | {acme_profile.eab_kid}               | YmFkLXNjcmV0Cg==          | urn:ietf:params:acme:error:externalAccountRequired | fixme     |
      | 4bc7959c-fe2d-4447-ae91-0cd893667af6 | {acme_profile.eab_secret} | urn:ietf:params:acme:error:externalAccountRequired | fixme     |
