# Actoers 
actor User {}
 
# Resource block
resource Organization {
  permissions = ["view", "delete", "edit_billing", "edit_members"];
  roles = ["owner", "member"];

  "view" if "member";
  "delete" if "owner";
  "edit_billing" if "owner";
  "edit_members" if "owner";

  "member" if "owner";
}