import { cloudflareInsertTxtRecord, cloudflareDeleteTxtRecord } from "./cloudflare";

// Configuration - Replace these with your actual values
const API_TOKEN = "PASTE_YOUR_API_TOKEN_HERE";
const ZONE_ID = "PASTE_YOUR_ZONE_ID_HERE";
const DOMAIN_NAME = "your-domain.com";

const TEST_CHALLENGE_VALUE = "test-challenge-value-" + Date.now();

async function testCloudflareDnsProvider() {
  console.log("--- Starting Isolated Cloudflare DNS Provider Test ---\n");

  let recordId: string | null = null;

  try {
    // Step 1: Test record creation
    console.log("[Step 1: Testing record creation]");
    console.log(`Attempting to create Cloudflare TXT record for: _acme-challenge.${DOMAIN_NAME}...`);
    
    recordId = await cloudflareInsertTxtRecord(
      API_TOKEN,
      ZONE_ID,
      DOMAIN_NAME,
      TEST_CHALLENGE_VALUE
    );
    
    console.log(`Successfully created Cloudflare TXT record with ID: ${recordId}`);
    console.log("✅ Test PASSED: Record created with ID:", recordId);

    // Step 2: Test record deletion
    console.log("\n[Step 2: Testing record deletion]");
    console.log(`Attempting to delete Cloudflare TXT record with ID: ${recordId}...`);
    
    await cloudflareDeleteTxtRecord(API_TOKEN, ZONE_ID, recordId);
    
    console.log("Successfully deleted Cloudflare TXT record.");
    console.log("✅ Test PASSED: Deletion function executed without error.");

    console.log("\n--- ✅ All Tests Passed Successfully ---");
    console.log("Your Cloudflare DNS provider integration is working correctly!");

  } catch (error) {
    console.error("\n--- ❌ Test Failed ---");
    console.error("Error:", error);
    
    // If we created a record but deletion failed, try to clean it up
    if (recordId) {
      console.log("\nAttempting to clean up created record...");
      try {
        await cloudflareDeleteTxtRecord(API_TOKEN, ZONE_ID, recordId);
        console.log("Cleanup successful.");
      } catch (cleanupError) {
        console.error("Cleanup failed:", cleanupError);
      }
    }
    
    process.exit(1);
  }
}

// Run the test
testCloudflareDnsProvider().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
}); 