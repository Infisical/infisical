export type TTeamCityProject = {
  id: string;
  name: string;
};

export type TTeamCityProjectWithBuildTypes = TTeamCityProject & {
  buildTypes: {
    buildType: {
      id: string;
      name: string;
    }[];
  };
};
