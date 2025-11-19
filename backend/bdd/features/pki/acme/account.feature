Feature: Account

  Scenario: Create a new account
    Given I have an ACME cert profile as "acme_profile"
    When I have an ACME client connecting to "{BASE_URL}/api/v1/pki/acme/profiles/{acme_profile.id}/directory"
    Then I register a new ACME account with email fangpen@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as acme_account
    And the value acme_account.uri with jq "." should match pattern {BASE_URL}/api/v1/pki/acme/profiles/{acme_profile.id}/accounts/(.+)

  Scenario: Create a new account with the same key pair twice
    Given I have an ACME cert profile as "acme_profile"
    When I have an ACME client connecting to "{BASE_URL}/api/v1/pki/acme/profiles/{acme_profile.id}/directory"
    Then I register a new ACME account with email fangpen@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as acme_account
    And I memorize acme_account.uri as kid
    And I register a new ACME account with email fangpen@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as acme_account2
    And the value error.__class__.__name__ should be equal to "ConflictError"
    And the value error.location should be equal to "{kid}"

  Scenario: Find an existing account
    Given I have an ACME cert profile as "acme_profile"
    When I have an ACME client connecting to "{BASE_URL}/api/v1/pki/acme/profiles/{acme_profile.id}/directory"
    Then I register a new ACME account with email fangpen@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as acme_account
    And I memorize acme_account.uri as account_uri
    And I find the existing ACME account with email fangpen@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as retrieved_account
    And the value retrieved_account.uri should be equal to "{account_uri}"

  # Note: This is a very special case for cert-manager.
  Scenario: Create a new account with EAB then retrieve it without EAB
    Given I have an ACME cert profile as "acme_profile"
    When I have an ACME client connecting to "{BASE_URL}/api/v1/pki/acme/profiles/{acme_profile.id}/directory"
    Then I register a new ACME account with email fangpen@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as acme_account
    And I memorize acme_account.uri as account_uri
    And I find the existing ACME account without EAB as retrieved_account
    And the value error with should be absent
    And the value retrieved_account.uri should be equal to "{account_uri}"

  Scenario: Create a new account without EAB
    Given I have an ACME cert profile as "acme_profile"
    When I have an ACME client connecting to "{BASE_URL}/api/v1/pki/acme/profiles/{acme_profile.id}/directory"
    Then I register a new ACME account with email fangpen@infisical.com without EAB
    And the value error with jq ".type" should be equal to "urn:ietf:params:acme:error:externalAccountRequired"

  Scenario Outline: Scenario: Create a new account with bad EAB credentials
    Given I have an ACME cert profile as "acme_profile"
    When I have an ACME client connecting to "{BASE_URL}/api/v1/pki/acme/profiles/{acme_profile.id}/directory"
    Then I register a new ACME account with email fangpen@infisical.com and EAB key id "<eab_kid>" with secret "<eab_secret>" as acme_account
    And the value error with jq ".type" should be equal to "<error_type>"
    And the value error with jq ".detail" should be equal to "<error_msg>"

    Examples: Bad Credentials
      | eab_kid                              | eab_secret                   | error_type                                         | error_msg                                      |
      | bad                                  | Cg==                         | urn:ietf:params:acme:error:externalAccountRequired | Invalid external account binding JWS signature |
      | {acme_profile.eab_kid}               | Cg==                         | urn:ietf:params:acme:error:externalAccountRequired | Invalid external account binding JWS signature |
      | {acme_profile.eab_kid}               | YmFkLXNjcmV0Cg==             | urn:ietf:params:acme:error:externalAccountRequired | Invalid external account binding JWS signature |
      | {acme_profile.eab_kid}               | ABC{acme_profile.eab_secret} | urn:ietf:params:acme:error:externalAccountRequired | Invalid external account binding JWS signature |
      | bad                                  | {acme_profile.eab_secret}    | urn:ietf:params:acme:error:externalAccountRequired | External account binding KID mismatch          |
      | 4bc7959c-fe2d-4447-ae91-0cd893667af6 | {acme_profile.eab_secret}    | urn:ietf:params:acme:error:externalAccountRequired | External account binding KID mismatch          |

  Scenario Outline: Scenario: Create a new account with bad EAB url
    Given I have an ACME cert profile as "acme_profile"
    When I have an ACME client connecting to "{BASE_URL}/api/v1/pki/acme/profiles/{acme_profile.id}/directory"
    And I use a different new-account URL "<url>" for EAB signature
    Then I register a new ACME account with email fangpen@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as acme_account
    And the value error with jq ".type" should be equal to "urn:ietf:params:acme:error:externalAccountRequired"
    And the value error with jq ".detail" should be equal to "External account binding URL mismatch"

    Examples: Bad URLs
      | url                                                                            |
      | {BASE_URL}/api/v1/pki/acme/profiles/{acme_profile.id}/new-account-bad          |
      | {BASE_URL}/api/v1/pki/acme/profiles/{acme_profile.id}/new-account?foo=bar      |
      | {BASE_URL}/api/v1/pki/acme/profiles/{acme_profile.id}/new-account#foobar       |
      | {BASE_URL}/acme/new-account                                                    |
      | https://example.com/api/v1/pki/acme/profiles/{acme_profile.id}/new-account-bad |
      | bad                                                                            |
