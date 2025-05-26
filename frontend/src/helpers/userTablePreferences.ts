const TABLE_PREFERENCES_KEY = "userTablePreferences";

export enum PreferenceKey {
  PerPage = "perPage"
}

interface TableSpecificPreferences {
  [preferenceKey: string]: any;
}

interface UserTablePreferences {
  [tableName: string]: TableSpecificPreferences;
}

// Retrieves all table preferences from localStorage
const getAllTablePreferences = (): UserTablePreferences => {
  try {
    const preferencesString = localStorage.getItem(TABLE_PREFERENCES_KEY);
    if (preferencesString) {
      return JSON.parse(preferencesString) as UserTablePreferences;
    }
  } catch (error) {
    console.error("Error reading user table preferences from localStorage:", error);
  }
  return {};
};

// Saves all table preferences to localStorage
const saveAllTablePreferences = (preferences: UserTablePreferences): void => {
  try {
    localStorage.setItem(TABLE_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.error("Error saving user table preferences to localStorage:", error);
  }
};

// Retrieves a specific preference for a given table
export const getUserTablePreference = <T>(
  tableName: string,
  preferenceKey: PreferenceKey,
  defaultValue: T
): T => {
  const preferences = getAllTablePreferences();
  if (
    preferences &&
    typeof preferences === "object" &&
    tableName in preferences &&
    preferenceKey in preferences[tableName]
  ) {
    const value = preferences[tableName][preferenceKey];

    if (value !== undefined && value !== null) {
      return value as T;
    }
  }
  return defaultValue;
};

// Sets a specific preference for a given table and saves it to localStorage
export const setUserTablePreference = (
  tableName: string,
  preferenceKey: PreferenceKey,
  value: any
): void => {
  const preferences = getAllTablePreferences();

  if (!preferences[tableName]) {
    preferences[tableName] = {};
  }

  preferences[tableName][preferenceKey] = value;
  saveAllTablePreferences(preferences);
};
