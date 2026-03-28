Feature: Enrollment Failure

  Scenario: Enrollment with wrong challenge password
    Given I have a SCEP cert profile with challenge password "testpassword123" as "scep_profile"
    When I enroll via SCEP for CN "test-device.example.com" with challenge "wrongpassword99" on profile "scep_profile"
    Then the SCEP enrollment should fail

  Scenario: Enrollment without challenge password
    Given I have a SCEP cert profile with challenge password "testpassword123" as "scep_profile"
    When I enroll via SCEP for CN "test-device.example.com" without challenge password on profile "scep_profile"
    Then the SCEP enrollment should fail

  Scenario: GetCACaps against non-existent profile returns 404
    Given I make a random uuid4 as FAKE_PROFILE_ID
    When I send a "GET" request to "/scep/{FAKE_PROFILE_ID}/pkiclient.exe?operation=GetCACaps"
    Then the response status code should be "404"
