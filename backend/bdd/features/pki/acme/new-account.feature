Feature: New Account
  Scenario: Create a new account
    Given I have an ACME cert profile as "acme_profile"
     When I register a new ACME account
