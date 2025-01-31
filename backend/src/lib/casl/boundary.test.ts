import { createMongoAbility } from "@casl/ability";

import { PermissionConditionOperators } from ".";
import { validatePermissionBoundary } from "./boundary";

describe("Validate Permission Boundary Function", () => {
  test.each([
    {
      title: "child with equal privilege",
      parentPermission: createMongoAbility([
        {
          action: ["create", "edit", "delete", "read"],
          subject: "secrets"
        }
      ]),
      childPermission: createMongoAbility([
        {
          action: ["create", "edit", "delete", "read"],
          subject: "secrets"
        }
      ]),
      expectValid: true,
      missingPermissions: []
    },
    {
      title: "child with less privilege",
      parentPermission: createMongoAbility([
        {
          action: ["create", "edit", "delete", "read"],
          subject: "secrets"
        }
      ]),
      childPermission: createMongoAbility([
        {
          action: ["create", "edit"],
          subject: "secrets"
        }
      ]),
      expectValid: true,
      missingPermissions: []
    },
    {
      title: "child with more privilege",
      parentPermission: createMongoAbility([
        {
          action: ["create"],
          subject: "secrets"
        }
      ]),
      childPermission: createMongoAbility([
        {
          action: ["create", "edit"],
          subject: "secrets"
        }
      ]),
      expectValid: false,
      missingPermissions: [{ action: "edit", subject: "secrets" }]
    },
    {
      title: "parent with multiple and child with multiple",
      parentPermission: createMongoAbility([
        {
          action: ["create"],
          subject: "secrets"
        },
        {
          action: ["create", "edit"],
          subject: "members"
        }
      ]),
      childPermission: createMongoAbility([
        {
          action: ["create"],
          subject: "members"
        },
        {
          action: ["create"],
          subject: "secrets"
        }
      ]),
      expectValid: true,
      missingPermissions: []
    },
    {
      title: "Child with no access",
      parentPermission: createMongoAbility([
        {
          action: ["create"],
          subject: "secrets"
        },
        {
          action: ["create", "edit"],
          subject: "members"
        }
      ]),
      childPermission: createMongoAbility([]),
      expectValid: true,
      missingPermissions: []
    },
    {
      title: "Parent and child disjoint set",
      parentPermission: createMongoAbility([
        {
          action: ["create", "edit", "delete", "read"],
          subject: "secrets",
          conditions: {
            environment: { [PermissionConditionOperators.$EQ]: "dev" }
          }
        }
      ]),
      childPermission: createMongoAbility([
        {
          action: ["create", "edit", "delete", "read"],
          subject: "secrets",
          conditions: {
            secretPath: { [PermissionConditionOperators.$EQ]: "dev" }
          }
        }
      ]),
      expectValid: false,
      missingPermissions: ["create", "edit", "delete", "read"].map((el) => ({
        action: el,
        subject: "secrets",
        conditions: {
          secretPath: { [PermissionConditionOperators.$EQ]: "dev" }
        }
      }))
    },
    {
      title: "Parent with inverted rules",
      parentPermission: createMongoAbility([
        {
          action: ["create", "edit", "delete", "read"],
          subject: "secrets",
          conditions: {
            environment: { [PermissionConditionOperators.$EQ]: "dev" }
          }
        },
        {
          action: "read",
          subject: "secrets",
          inverted: true,
          conditions: {
            environment: { [PermissionConditionOperators.$EQ]: "dev" },
            secretPath: { [PermissionConditionOperators.$GLOB]: "/hello/**" }
          }
        }
      ]),
      childPermission: createMongoAbility([
        {
          action: "read",
          subject: "secrets",
          conditions: {
            environment: { [PermissionConditionOperators.$EQ]: "dev" },
            secretPath: { [PermissionConditionOperators.$EQ]: "/" }
          }
        }
      ]),
      expectValid: true,
      missingPermissions: []
    },
    {
      title: "Parent with inverted rules - child accessing invalid one",
      parentPermission: createMongoAbility([
        {
          action: ["create", "edit", "delete", "read"],
          subject: "secrets",
          conditions: {
            environment: { [PermissionConditionOperators.$EQ]: "dev" }
          }
        },
        {
          action: "read",
          subject: "secrets",
          inverted: true,
          conditions: {
            environment: { [PermissionConditionOperators.$EQ]: "dev" },
            secretPath: { [PermissionConditionOperators.$GLOB]: "/hello/**" }
          }
        }
      ]),
      childPermission: createMongoAbility([
        {
          action: "read",
          subject: "secrets",
          conditions: {
            environment: { [PermissionConditionOperators.$EQ]: "dev" },
            secretPath: { [PermissionConditionOperators.$EQ]: "/hello/world" }
          }
        }
      ]),
      expectValid: false,
      missingPermissions: [
        {
          action: "read",
          subject: "secrets",
          conditions: {
            environment: { [PermissionConditionOperators.$EQ]: "dev" },
            secretPath: { [PermissionConditionOperators.$EQ]: "/hello/world" }
          }
        }
      ]
    }
  ])("Check permission: $title", ({ parentPermission, childPermission, expectValid, missingPermissions }) => {
    const permissionBoundary = validatePermissionBoundary(parentPermission, childPermission);
    if (expectValid) {
      expect(permissionBoundary.isValid).toBeTruthy();
    } else {
      expect(permissionBoundary.isValid).toBeFalsy();
      expect(permissionBoundary.missingPermissions).toEqual(expect.arrayContaining(missingPermissions));
    }
  });
});

describe("Validate Permission Boundary: Checking Parent $eq operator", () => {
  const parentPermission = createMongoAbility([
    {
      action: ["create", "read"],
      subject: "secrets",
      conditions: {
        environment: { [PermissionConditionOperators.$EQ]: "dev" }
      }
    }
  ]);

  test.each([
    {
      operator: PermissionConditionOperators.$EQ,
      childPermission: createMongoAbility([
        {
          action: ["create"],
          subject: "secrets",
          conditions: {
            environment: { [PermissionConditionOperators.$EQ]: "dev" }
          }
        }
      ])
    },
    {
      operator: PermissionConditionOperators.$IN,
      childPermission: createMongoAbility([
        {
          action: ["create"],
          subject: "secrets",
          conditions: {
            environment: { [PermissionConditionOperators.$IN]: ["dev"] }
          }
        }
      ])
    },
    {
      operator: PermissionConditionOperators.$GLOB,
      childPermission: createMongoAbility([
        {
          action: ["create"],
          subject: "secrets",
          conditions: {
            environment: { [PermissionConditionOperators.$GLOB]: "dev" }
          }
        }
      ])
    }
  ])("Child $operator truthy cases", ({ childPermission }) => {
    const permissionBoundary = validatePermissionBoundary(parentPermission, childPermission);
    expect(permissionBoundary.isValid).toBeTruthy();
  });

  test.each([
    {
      operator: PermissionConditionOperators.$EQ,
      childPermission: createMongoAbility([
        {
          action: ["create"],
          subject: "secrets",
          conditions: {
            environment: { [PermissionConditionOperators.$EQ]: "prod" }
          }
        }
      ])
    },
    {
      operator: PermissionConditionOperators.$IN,
      childPermission: createMongoAbility([
        {
          action: ["create"],
          subject: "secrets",
          conditions: {
            environment: { [PermissionConditionOperators.$IN]: ["dev", "prod"] }
          }
        }
      ])
    },
    {
      operator: PermissionConditionOperators.$GLOB,
      childPermission: createMongoAbility([
        {
          action: ["create"],
          subject: "secrets",
          conditions: {
            environment: { [PermissionConditionOperators.$GLOB]: "dev**" }
          }
        }
      ])
    },
    {
      operator: PermissionConditionOperators.$NEQ,
      childPermission: createMongoAbility([
        {
          action: ["create"],
          subject: "secrets",
          conditions: {
            environment: { [PermissionConditionOperators.$GLOB]: "staging" }
          }
        }
      ])
    }
  ])("Child $operator falsy cases", ({ childPermission }) => {
    const permissionBoundary = validatePermissionBoundary(parentPermission, childPermission);
    expect(permissionBoundary.isValid).toBeFalsy();
  });
});

describe("Validate Permission Boundary: Checking Parent $neq operator", () => {
  const parentPermission = createMongoAbility([
    {
      action: ["create", "read"],
      subject: "secrets",
      conditions: {
        secretPath: { [PermissionConditionOperators.$NEQ]: "/hello" }
      }
    }
  ]);

  test.each([
    {
      operator: PermissionConditionOperators.$EQ,
      childPermission: createMongoAbility([
        {
          action: ["create"],
          subject: "secrets",
          conditions: {
            secretPath: { [PermissionConditionOperators.$EQ]: "/" }
          }
        }
      ])
    },
    {
      operator: PermissionConditionOperators.$NEQ,
      childPermission: createMongoAbility([
        {
          action: ["create"],
          subject: "secrets",
          conditions: {
            secretPath: { [PermissionConditionOperators.$NEQ]: "/hello" }
          }
        }
      ])
    },
    {
      operator: PermissionConditionOperators.$IN,
      childPermission: createMongoAbility([
        {
          action: ["create"],
          subject: "secrets",
          conditions: {
            secretPath: { [PermissionConditionOperators.$IN]: ["/", "/staging"] }
          }
        }
      ])
    },
    {
      operator: PermissionConditionOperators.$GLOB,
      childPermission: createMongoAbility([
        {
          action: ["create"],
          subject: "secrets",
          conditions: {
            secretPath: { [PermissionConditionOperators.$GLOB]: "/dev**" }
          }
        }
      ])
    }
  ])("Child $operator truthy cases", ({ childPermission }) => {
    const permissionBoundary = validatePermissionBoundary(parentPermission, childPermission);
    expect(permissionBoundary.isValid).toBeTruthy();
  });

  test.each([
    {
      operator: PermissionConditionOperators.$EQ,
      childPermission: createMongoAbility([
        {
          action: ["create"],
          subject: "secrets",
          conditions: {
            secretPath: { [PermissionConditionOperators.$EQ]: "/hello" }
          }
        }
      ])
    },
    {
      operator: PermissionConditionOperators.$NEQ,
      childPermission: createMongoAbility([
        {
          action: ["create"],
          subject: "secrets",
          conditions: {
            secretPath: { [PermissionConditionOperators.$NEQ]: "/" }
          }
        }
      ])
    },
    {
      operator: PermissionConditionOperators.$IN,
      childPermission: createMongoAbility([
        {
          action: ["create"],
          subject: "secrets",
          conditions: {
            secretPath: { [PermissionConditionOperators.$IN]: ["/", "/hello"] }
          }
        }
      ])
    },
    {
      operator: PermissionConditionOperators.$GLOB,
      childPermission: createMongoAbility([
        {
          action: ["create"],
          subject: "secrets",
          conditions: {
            secretPath: { [PermissionConditionOperators.$GLOB]: "/hello**" }
          }
        }
      ])
    }
  ])("Child $operator falsy cases", ({ childPermission }) => {
    const permissionBoundary = validatePermissionBoundary(parentPermission, childPermission);
    expect(permissionBoundary.isValid).toBeFalsy();
  });
});

describe("Validate Permission Boundary: Checking Parent $IN operator", () => {
  const parentPermission = createMongoAbility([
    {
      action: ["edit"],
      subject: "secrets",
      conditions: {
        environment: { [PermissionConditionOperators.$IN]: ["dev", "staging"] }
      }
    }
  ]);

  test.each([
    {
      operator: PermissionConditionOperators.$EQ,
      childPermission: createMongoAbility([
        {
          action: ["edit"],
          subject: "secrets",
          conditions: {
            environment: { [PermissionConditionOperators.$EQ]: "dev" }
          }
        }
      ])
    },
    {
      operator: PermissionConditionOperators.$IN,
      childPermission: createMongoAbility([
        {
          action: ["edit"],
          subject: "secrets",
          conditions: {
            environment: { [PermissionConditionOperators.$IN]: ["dev"] }
          }
        }
      ])
    },
    {
      operator: `${PermissionConditionOperators.$IN} - 2`,
      childPermission: createMongoAbility([
        {
          action: ["edit"],
          subject: "secrets",
          conditions: {
            environment: { [PermissionConditionOperators.$IN]: ["dev", "staging"] }
          }
        }
      ])
    },
    {
      operator: PermissionConditionOperators.$GLOB,
      childPermission: createMongoAbility([
        {
          action: ["edit"],
          subject: "secrets",
          conditions: {
            environment: { [PermissionConditionOperators.$GLOB]: "dev" }
          }
        }
      ])
    }
  ])("Child $operator truthy cases", ({ childPermission }) => {
    const permissionBoundary = validatePermissionBoundary(parentPermission, childPermission);
    expect(permissionBoundary.isValid).toBeTruthy();
  });

  test.each([
    {
      operator: PermissionConditionOperators.$EQ,
      childPermission: createMongoAbility([
        {
          action: ["edit"],
          subject: "secrets",
          conditions: {
            environment: { [PermissionConditionOperators.$EQ]: "prod" }
          }
        }
      ])
    },
    {
      operator: PermissionConditionOperators.$NEQ,
      childPermission: createMongoAbility([
        {
          action: ["edit"],
          subject: "secrets",
          conditions: {
            environment: { [PermissionConditionOperators.$NEQ]: "dev" }
          }
        }
      ])
    },
    {
      operator: PermissionConditionOperators.$IN,
      childPermission: createMongoAbility([
        {
          action: ["edit"],
          subject: "secrets",
          conditions: {
            environment: { [PermissionConditionOperators.$IN]: ["dev", "prod"] }
          }
        }
      ])
    },
    {
      operator: PermissionConditionOperators.$GLOB,
      childPermission: createMongoAbility([
        {
          action: ["edit"],
          subject: "secrets",
          conditions: {
            environment: { [PermissionConditionOperators.$GLOB]: "dev**" }
          }
        }
      ])
    }
  ])("Child $operator falsy cases", ({ childPermission }) => {
    const permissionBoundary = validatePermissionBoundary(parentPermission, childPermission);
    expect(permissionBoundary.isValid).toBeFalsy();
  });
});

describe("Validate Permission Boundary: Checking Parent $GLOB operator", () => {
  const parentPermission = createMongoAbility([
    {
      action: ["create", "read"],
      subject: "secrets",
      conditions: {
        secretPath: { [PermissionConditionOperators.$GLOB]: "/hello/**" }
      }
    }
  ]);

  test.each([
    {
      operator: PermissionConditionOperators.$EQ,
      childPermission: createMongoAbility([
        {
          action: ["create"],
          subject: "secrets",
          conditions: {
            secretPath: { [PermissionConditionOperators.$EQ]: "/hello/world" }
          }
        }
      ])
    },
    {
      operator: PermissionConditionOperators.$IN,
      childPermission: createMongoAbility([
        {
          action: ["create"],
          subject: "secrets",
          conditions: {
            secretPath: { [PermissionConditionOperators.$IN]: ["/hello/world", "/hello/world2"] }
          }
        }
      ])
    },
    {
      operator: PermissionConditionOperators.$GLOB,
      childPermission: createMongoAbility([
        {
          action: ["create"],
          subject: "secrets",
          conditions: {
            secretPath: { [PermissionConditionOperators.$GLOB]: "/hello/**/world" }
          }
        }
      ])
    }
  ])("Child $operator truthy cases", ({ childPermission }) => {
    const permissionBoundary = validatePermissionBoundary(parentPermission, childPermission);
    expect(permissionBoundary.isValid).toBeTruthy();
  });

  test.each([
    {
      operator: PermissionConditionOperators.$EQ,
      childPermission: createMongoAbility([
        {
          action: ["create"],
          subject: "secrets",
          conditions: {
            secretPath: { [PermissionConditionOperators.$EQ]: "/print" }
          }
        }
      ])
    },
    {
      operator: PermissionConditionOperators.$NEQ,
      childPermission: createMongoAbility([
        {
          action: ["create"],
          subject: "secrets",
          conditions: {
            secretPath: { [PermissionConditionOperators.$NEQ]: "/hello/world" }
          }
        }
      ])
    },
    {
      operator: PermissionConditionOperators.$IN,
      childPermission: createMongoAbility([
        {
          action: ["create"],
          subject: "secrets",
          conditions: {
            secretPath: { [PermissionConditionOperators.$IN]: ["/", "/hello"] }
          }
        }
      ])
    },
    {
      operator: PermissionConditionOperators.$GLOB,
      childPermission: createMongoAbility([
        {
          action: ["create"],
          subject: "secrets",
          conditions: {
            secretPath: { [PermissionConditionOperators.$GLOB]: "/hello**" }
          }
        }
      ])
    }
  ])("Child $operator falsy cases", ({ childPermission }) => {
    const permissionBoundary = validatePermissionBoundary(parentPermission, childPermission);
    expect(permissionBoundary.isValid).toBeFalsy();
  });
});
