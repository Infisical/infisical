Feature: Account

  Scenario: Create a new account
    Given I have an ACME cert profile as "acme_profile"
    When I have an ACME client connecting to "{BASE_URL}/api/v1/pki/acme/profiles/{acme_profile.id}/directory"
    Then I register a new ACME account with email fangpen@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as acme_account
    And the value acme_account.uri with jq "." should match pattern {BASE_URL}/api/v1/pki/acme/profiles/{acme_profile.id}/accounts/(.+)

  Scenario: Find an existing account
    Given I have an ACME cert profile as "acme_profile"
    When I have an ACME client connecting to "{BASE_URL}/api/v1/pki/acme/profiles/{acme_profile.id}/directory"
    Then I register a new ACME account with email fangpen@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as acme_account
    And I memorize acme_account.uri as account_uri
    And I find the existing ACME account with email fangpen@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as retrieved_account
    And the value retrieved_account.uri should be equal to "{account_uri}"

  # Note: This is a very special case for cert-manager.
  # There's a bug in their ACME client implementation, they don't take the account KID value they have
  # and relying on a '{"onlyReturnExisting": true}' new-account request to find out their KID value.
  # But the problem is, that new-account request doesn't come with EAB. And while the get existing account operation
  # fails, they just discard the error and proceed to request a new order. Since no KID provided, their ACME
  # client will send JWK instead. As a result, we are seeing KID not provide in header error for the new-order
  # endpoint.
  #
  # To solve the problem, we lose the check for EAB a bit for the onlyReturnExisting new account request
  # ref: https://github.com/cert-manager/cert-manager/issues/7388#issuecomment-3535630925
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
