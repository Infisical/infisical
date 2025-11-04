Feature: Nonce

  Scenario: Generate a new nonce
    Given I have an ACME cert profile as "acme_profile"
    When I send a HEAD request to "/api/v1/pki/acme/profiles/{acme_profile.id}/new-nonce"
    Then the response status code should be "200"
    Then the response header "Replay-Nonce" should contains non-empty value
