import { GlobPermissionInfo } from "@app/components/permissions";
import { SelectItem } from "@app/components/v3";
import {
  PermissionConditionOperators,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";

export const getConditionOperatorHelperInfo = (type: PermissionConditionOperators) => {
  switch (type) {
    case PermissionConditionOperators.$EQ:
      return "Value should equal specified value.";
    case PermissionConditionOperators.$NEQ:
      return "Value should not equal specified value.";
    case PermissionConditionOperators.$IN:
      return "List of comma-separated values that match a given value.";
    case PermissionConditionOperators.$ALL:
      return "List of comma-separated values that must all be present.";
    case PermissionConditionOperators.$GLOB:
      return <GlobPermissionInfo />;
    default:
      return "";
  }
};

export const renderOperatorSelectItems = (type: string, subject?: string) => {
  switch (type) {
    case "secretTags":
      return (
        <>
          <SelectItem value={PermissionConditionOperators.$IN}>Contains</SelectItem>
          <SelectItem value={PermissionConditionOperators.$ALL}>Contains All</SelectItem>
        </>
      );
    case "metadataKey":
    case "metadataValue":
      if (subject === ProjectPermissionSub.Certificates) {
        return (
          <>
            <SelectItem value={PermissionConditionOperators.$EQ}>Equal</SelectItem>
            <SelectItem value={PermissionConditionOperators.$IN}>In</SelectItem>
          </>
        );
      }
      return (
        <>
          <SelectItem value={PermissionConditionOperators.$EQ}>Equal</SelectItem>
          <SelectItem value={PermissionConditionOperators.$NEQ}>Not Equal</SelectItem>
          <SelectItem value={PermissionConditionOperators.$IN}>In</SelectItem>
        </>
      );
    case "identityId":
    case "connectionId":
    case "role":
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
