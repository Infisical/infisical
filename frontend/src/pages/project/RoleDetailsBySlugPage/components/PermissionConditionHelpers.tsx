import { GlobPermissionInfo } from "@app/components/permissions";
import { SelectItem } from "@app/components/v3";
import { PermissionConditionOperators } from "@app/context/ProjectPermissionContext/types";

export const getConditionOperatorHelperInfo = (type: PermissionConditionOperators) => {
  switch (type) {
    case PermissionConditionOperators.$EQ:
      return "Value should equal specified value.";
    case PermissionConditionOperators.$NEQ:
      return "Value should not equal specified value.";
    case PermissionConditionOperators.$IN:
      return "List of comma-separated values that match a given value.";
    case PermissionConditionOperators.$GLOB:
      return <GlobPermissionInfo />;
    default:
      return "";
  }
};

// scott: we may need to pass the subject in the future to further refine returned items
export const renderOperatorSelectItems = (type: string) => {
  switch (type) {
    case "secretTags":
      return <SelectItem value={PermissionConditionOperators.$IN}>Contains</SelectItem>;
    case "identityId":
    case "connectionId":
      return (
        <>
          <SelectItem value={PermissionConditionOperators.$EQ}>Equal</SelectItem>
          <SelectItem value={PermissionConditionOperators.$NEQ}>Not Equal</SelectItem>
          <SelectItem value={PermissionConditionOperators.$IN}>In</SelectItem>
        </>
      );
    case "hostname":
    case "name":
      return (
        <>
          <SelectItem value={PermissionConditionOperators.$EQ}>Equal</SelectItem>
          <SelectItem value={PermissionConditionOperators.$NEQ}>Not Equal</SelectItem>
          <SelectItem value={PermissionConditionOperators.$GLOB}>Glob Match</SelectItem>
          <SelectItem value={PermissionConditionOperators.$IN}>In</SelectItem>
        </>
      );
    case "eventType":
      return (
        <>
          <SelectItem value={PermissionConditionOperators.$EQ}>Equal</SelectItem>
          <SelectItem value={PermissionConditionOperators.$NEQ}>Not Equal</SelectItem>
          <SelectItem value={PermissionConditionOperators.$IN}>In</SelectItem>
        </>
      );
    default:
      return (
        <>
          <SelectItem value={PermissionConditionOperators.$EQ}>Equal</SelectItem>
          <SelectItem value={PermissionConditionOperators.$NEQ}>Not Equal</SelectItem>
          <SelectItem value={PermissionConditionOperators.$GLOB}>Glob Match</SelectItem>
          <SelectItem value={PermissionConditionOperators.$IN}>In</SelectItem>
        </>
      );
  }
};
