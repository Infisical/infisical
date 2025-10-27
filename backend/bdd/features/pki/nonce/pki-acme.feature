Feature: Nonce
  Scenario: Generate a new nonce
    Given I have a PKI project as "pki_project"
     When I send a HEAD request to "/v1/pki/acme/profiles/{pki_project.id}/new-nonce"
     Then the response header "Replay-Nonce" should contains non-empty value
