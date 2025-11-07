Feature: Nonce

  Scenario: Generate a new nonce
    Given I have an ACME cert profile as "acme_profile"
    When I send a "HEAD" request to "/api/v1/pki/acme/profiles/{acme_profile.id}/new-nonce"
    Then the response status code should be "200"
    Then the response header "Replay-Nonce" should contains non-empty value

  Scenario: Send bad nonce
    Given I have an ACME cert profile as "acme_profile"
    When I have an ACME client connecting to {BASE_URL}/api/v1/pki/acme/profiles/{acme_profile.id}/directory
    Then I register a new ACME account with email fangpen@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as acme_account
    Then I memorize acme_account.uri with jq "capture("/(?<id>[^/]+)$") | .id" as account_id
    When I send a raw ACME request to "/api/v1/pki/acme/profiles/{acme_profile.id}/accounts/{account_id}/orders"
    """
    {
      "protected": {
        "alg": "RS256",
        "nonce": "oFvnlFP1wIhRlYS2jTaXbA",
        "url": "{BASE_URL}/api/v1/pki/acme/profiles/{acme_profile.id}/accounts/{account_id}/orders",
        "kid": "{acme_account.uri}"
      },
      "payload": {}
    }
    """
    Then the value response.status_code should be equal to 400
    Then the value response with jq ".type" should be equal to "urn:ietf:params:acme:error:badNonce"
    Then the value response with jq ".status" should be equal to 400
    Then the value response with jq ".detail" should be equal to "Invalid nonce"
