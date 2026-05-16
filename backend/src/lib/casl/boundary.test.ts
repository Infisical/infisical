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
            environment: { [PermissionConditionOperators.$NEQ]: "staging" }
          }
        }
      ])
    }
  ])("Child $operator falsy cases", ({ childPermission }) => {
    const permissionBoundary = validatePermissionBoundary(parentPermission, childPermission);
    expect(permissionBoundary.isValid).toBeFalsy();
  });
});

describe("Validate Permission Boundary: $ne child cannot bypass $eq/$in parent", () => {
  test("Child $ne should not be subset of parent $eq with different value", () => {
    // Parent: can read secrets ONLY in "qa"
    // Child: can read secrets in ALL environments EXCEPT "dev" — much broader
    const parentPermission = createMongoAbility([
      {
        action: ["read"],
        subject: "secrets",
        conditions: {
          environment: { [PermissionConditionOperators.$EQ]: "qa" }
        }
      }
    ]);
    const childPermission = createMongoAbility([
      {
        action: ["read"],
        subject: "secrets",
        conditions: {
          environment: { [PermissionConditionOperators.$NEQ]: "dev" }
        }
      }
    ]);
    const result = validatePermissionBoundary(parentPermission, childPermission);
    expect(result.isValid).toBeFalsy();
  });

  test("Child $ne should not be subset of parent $eq with same value", () => {
    // Parent: only "dev", Child: everything except "dev" — completely disjoint
    const parentPermission = createMongoAbility([
      {
        action: ["read"],
        subject: "secrets",
        conditions: {
          environment: { [PermissionConditionOperators.$EQ]: "dev" }
        }
      }
    ]);
    const childPermission = createMongoAbility([
      {
        action: ["read"],
        subject: "secrets",
        conditions: {
          environment: { [PermissionConditionOperators.$NEQ]: "dev" }
        }
      }
    ]);
    const result = validatePermissionBoundary(parentPermission, childPermission);
    expect(result.isValid).toBeFalsy();
  });

  test("Child $ne should not be subset of parent $in when value is outside $in list", () => {
    // Parent: only ["dev", "staging"], Child: everything except "prod" — much broader
    const parentPermission = createMongoAbility([
      {
        action: ["edit"],
        subject: "secrets",
        conditions: {
          environment: { [PermissionConditionOperators.$IN]: ["dev", "staging"] }
        }
      }
    ]);
    const childPermission = createMongoAbility([
      {
        action: ["edit"],
        subject: "secrets",
        conditions: {
          environment: { [PermissionConditionOperators.$NEQ]: "prod" }
        }
      }
    ]);
    const result = validatePermissionBoundary(parentPermission, childPermission);
    expect(result.isValid).toBeFalsy();
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
  ])("Child $operator (parent /hello/** $GLOB) truthy cases", ({ childPermission }) => {
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
  ])("Child $operator (parent /hello/** $GLOB) falsy cases", ({ childPermission }) => {
    const permissionBoundary = validatePermissionBoundary(parentPermission, childPermission);
    expect(permissionBoundary.isValid).toBeFalsy();
  });
});

describe("Validate Permission Boundary: glob-subset of glob (positive parent)", () => {
  // Regression for the literal-string-match flaw: `picomatch.isMatch('/apps/**', '/apps/*')`
  // returns true because `**` is two literal characters with no `/`, so the previous boundary
  // logic accepted `/apps/**` as a "subset" of `/apps/*` and let callers widen single-segment
  // scope to recursive scope. The new check uses set containment over the two glob languages.
  test("Child $glob broader than parent $glob is rejected ('/apps/*' parent, '/apps/**' child)", () => {
    const parentPermission = createMongoAbility([
      {
        action: ["read"],
        subject: "secrets",
        conditions: {
          secretPath: { [PermissionConditionOperators.$GLOB]: "/apps/*" }
        }
      }
    ]);
    const childPermission = createMongoAbility([
      {
        action: ["read"],
        subject: "secrets",
        conditions: {
          secretPath: { [PermissionConditionOperators.$GLOB]: "/apps/**" }
        }
      }
    ]);
    expect(validatePermissionBoundary(parentPermission, childPermission).isValid).toBeFalsy();
  });

  test("Child $glob equally narrow than parent $glob is accepted ('/apps/*' parent, '/apps/foo' child)", () => {
    const parentPermission = createMongoAbility([
      {
        action: ["read"],
        subject: "secrets",
        conditions: {
          secretPath: { [PermissionConditionOperators.$GLOB]: "/apps/*" }
        }
      }
    ]);
    const childPermission = createMongoAbility([
      {
        action: ["read"],
        subject: "secrets",
        conditions: {
          secretPath: { [PermissionConditionOperators.$GLOB]: "/apps/foo" }
        }
      }
    ]);
    expect(validatePermissionBoundary(parentPermission, childPermission).isValid).toBeTruthy();
  });

  test("Disjoint glob siblings ('/apps/*' parent, '/secret/*' child) is rejected", () => {
    const parentPermission = createMongoAbility([
      {
        action: ["read"],
        subject: "secrets",
        conditions: {
          secretPath: { [PermissionConditionOperators.$GLOB]: "/apps/*" }
        }
      }
    ]);
    const childPermission = createMongoAbility([
      {
        action: ["read"],
        subject: "secrets",
        conditions: {
          secretPath: { [PermissionConditionOperators.$GLOB]: "/secret/*" }
        }
      }
    ]);
    expect(validatePermissionBoundary(parentPermission, childPermission).isValid).toBeFalsy();
  });
});

describe("Validate Permission Boundary: inverted (deny) rule overlap", () => {
  // Regression for the inverted-rule bypass: a caller with positive `read` plus a deny rule
  // scoped to `/secret/**` must not be able to mint a child rule scoped to `/**`, because the
  // child grants exactly the access the parent's deny region forbids. The previous check only
  // tested "child fully contained in deny region", missing the "child broader than deny region"
  // case.
  test("Child broader than parent's deny region is rejected (deny '/secret/**' + child '/**')", () => {
    const parentPermission = createMongoAbility([
      { action: "read", subject: "secrets" },
      {
        action: "read",
        subject: "secrets",
        inverted: true,
        conditions: {
          secretPath: { [PermissionConditionOperators.$GLOB]: "/secret/**" }
        }
      }
    ]);
    const childPermission = createMongoAbility([
      {
        action: "read",
        subject: "secrets",
        conditions: {
          secretPath: { [PermissionConditionOperators.$GLOB]: "/**" }
        }
      }
    ]);
    expect(validatePermissionBoundary(parentPermission, childPermission).isValid).toBeFalsy();
  });

  test("Child without the deny-region's constrained field is rejected (deny path='/secret/**' + child {})", () => {
    const parentPermission = createMongoAbility([
      { action: "read", subject: "secrets" },
      {
        action: "read",
        subject: "secrets",
        inverted: true,
        conditions: {
          secretPath: { [PermissionConditionOperators.$GLOB]: "/secret/**" }
        }
      }
    ]);
    const childPermission = createMongoAbility([{ action: "read", subject: "secrets" }]);
    expect(validatePermissionBoundary(parentPermission, childPermission).isValid).toBeFalsy();
  });

  test("Child fully outside the deny region is accepted (deny '/secret/**' + child '/apps/**')", () => {
    const parentPermission = createMongoAbility([
      { action: "read", subject: "secrets" },
      {
        action: "read",
        subject: "secrets",
        inverted: true,
        conditions: {
          secretPath: { [PermissionConditionOperators.$GLOB]: "/secret/**" }
        }
      }
    ]);
    const childPermission = createMongoAbility([
      {
        action: "read",
        subject: "secrets",
        conditions: {
          secretPath: { [PermissionConditionOperators.$GLOB]: "/apps/**" }
        }
      }
    ]);
    expect(validatePermissionBoundary(parentPermission, childPermission).isValid).toBeTruthy();
  });

  test("Child disjoint from deny via a different field is accepted (deny env=dev path='/secret/**' + child env=prod)", () => {
    const parentPermission = createMongoAbility([
      { action: "read", subject: "secrets" },
      {
        action: "read",
        subject: "secrets",
        inverted: true,
        conditions: {
          environment: { [PermissionConditionOperators.$EQ]: "dev" },
          secretPath: { [PermissionConditionOperators.$GLOB]: "/secret/**" }
        }
      }
    ]);
    const childPermission = createMongoAbility([
      {
        action: "read",
        subject: "secrets",
        conditions: {
          environment: { [PermissionConditionOperators.$EQ]: "prod" }
        }
      }
    ]);
    expect(validatePermissionBoundary(parentPermission, childPermission).isValid).toBeTruthy();
  });

  test("Unconditional inverted rule denies all subsets", () => {
    const parentPermission = createMongoAbility([
      { action: "read", subject: "secrets" },
      { action: "read", subject: "secrets", inverted: true }
    ]);
    const childPermission = createMongoAbility([
      {
        action: "read",
        subject: "secrets",
        conditions: {
          secretPath: { [PermissionConditionOperators.$EQ]: "/" }
        }
      }
    ]);
    expect(validatePermissionBoundary(parentPermission, childPermission).isValid).toBeFalsy();
  });
});
