pms_template

{
  _id: ObjectId("6a318f8a4cb4a92704eb6905"),
  name: "PMS_AY",
  code: "AY",
  status: "ACTIVE",
  effectiveDate: ISODate("2026-04-01T00:00:00.000Z"),
  isDeleted: false,
  createdBy: ObjectId("6912fdf00ba77ccca78f6f8b"),
  version: 1,
  createdAt: ISODate("2026-06-16T18:01:46.391Z"),
  updatedAt: ISODate("2026-06-16T18:02:07.862Z"),
  __v: 0,
  currentVersionId: ObjectId("6a318f8a4cb4a92704eb690c"),
  updatedBy: ObjectId("6912fdf00ba77ccca78f6f8b")
}

pms_template_version
{
  _id: ObjectId("6a318f8a4cb4a92704eb690c"),
  templateId: ObjectId("6a318f8a4cb4a92704eb6905"),
  versionNo: 1,
  status: "ACTIVE",
  sections: [
    {
      sectionKey: "employee_information",
      sectionLabel: "Employee Information",
      sectionType: "VISIBILITY_GOVERNANCE",
      level: "ANNUAL",
      repeatFor: [],
      repeatable: false,
      displayOrder: 1,
      layout: "grid",
      renderingScope: "BOTH",
      quarterScope: [],
      sectionScoringConfig: {
        participatesInScoring: false,
        weightage: 0,
        aggregationMethod: "WEIGHTED_AVERAGE",
        maxSectionScore: 100
      },
      metadata: {
        starterGenerated: true,
        starterKey: "employee_information",
        employeeInfoDefaultSection: true,
        employeeInfoSource: "EMPLOYEE_MASTER"
      },
      fields: [
        {
          fieldKey: "employee_name",
          fieldLabel: "Employee Name",
          fieldType: "SHORT_TEXT",
          fieldCategory: "NORMAL",
          isRequired: false,
          displayOrder: 1,
          placeholder: "",
          helpText: "",
          hideLabel: false,
          validationRules: {
            requiredFor: []
          },
          visibilityRules: {
            visibleTo: [
              "ADMIN",
              "DIRECTOR"
            ],
            hiddenFrom: [
              "EMPLOYEE",
              "MANAGER",
              "MANAGEMENT"
            ],
            hierarchyScopes: [
              "department",
              "business-unit",
              "region",
              "global"
            ],
            visibleStates: [
              "VISIBILITY_ENABLED",
              "COMMUNICATION_READY",
              "COMMUNICATION_SENT"
            ],
            publishFlagRequired: true,
            publishFlags: [
              "employeeGradeVisible"
            ]
          },
          editabilityRules: {
            editableBy: [
              "ADMIN"
            ],
            editableStates: [
              "VISIBILITY_ENABLED",
              "COMMUNICATION_READY"
            ]
          },
          scoringConfig: {
            participatesInScoring: false
          },
          colSpan: 2,
          behaviors: [
            {
              workflowState: "VISIBILITY_ENABLED",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "COMMUNICATION_READY",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "COMMUNICATION_SENT",
              role: "DIRECTOR",
              visibility: "VISIBLE",
              editability: "READ_ONLY",
              mandatory: false
            }
          ],
          options: []
        },
        {
          fieldKey: "department_name",
          fieldLabel: "Department",
          fieldType: "SHORT_TEXT",
          fieldCategory: "NORMAL",
          isRequired: false,
          displayOrder: 2,
          placeholder: "",
          helpText: "",
          hideLabel: false,
          validationRules: {
            requiredFor: []
          },
          visibilityRules: {
            visibleTo: [
              "ADMIN",
              "DIRECTOR"
            ],
            hiddenFrom: [
              "EMPLOYEE",
              "MANAGER",
              "MANAGEMENT"
            ],
            hierarchyScopes: [
              "department",
              "business-unit",
              "region",
              "global"
            ],
            visibleStates: [
              "VISIBILITY_ENABLED",
              "COMMUNICATION_READY",
              "COMMUNICATION_SENT"
            ],
            publishFlagRequired: true,
            publishFlags: [
              "employeeGradeVisible"
            ]
          },
          editabilityRules: {
            editableBy: [
              "ADMIN"
            ],
            editableStates: [
              "VISIBILITY_ENABLED",
              "COMMUNICATION_READY"
            ]
          },
          scoringConfig: {
            participatesInScoring: false
          },
          colSpan: 2,
          behaviors: [
            {
              workflowState: "VISIBILITY_ENABLED",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "COMMUNICATION_READY",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "COMMUNICATION_SENT",
              role: "DIRECTOR",
              visibility: "VISIBLE",
              editability: "READ_ONLY",
              mandatory: false
            }
          ],
          options: []
        },
        {
          fieldKey: "employee_no",
          fieldLabel: "Employee No.",
          fieldType: "SHORT_TEXT",
          fieldCategory: "NORMAL",
          isRequired: false,
          displayOrder: 3,
          placeholder: "",
          helpText: "",
          hideLabel: false,
          validationRules: {
            requiredFor: []
          },
          visibilityRules: {
            visibleTo: [
              "ADMIN",
              "DIRECTOR"
            ],
            hiddenFrom: [
              "EMPLOYEE",
              "MANAGER",
              "MANAGEMENT"
            ],
            hierarchyScopes: [
              "department",
              "business-unit",
              "region",
              "global"
            ],
            visibleStates: [
              "VISIBILITY_ENABLED",
              "COMMUNICATION_READY",
              "COMMUNICATION_SENT"
            ],
            publishFlagRequired: true,
            publishFlags: [
              "employeeGradeVisible"
            ]
          },
          editabilityRules: {
            editableBy: [
              "ADMIN"
            ],
            editableStates: [
              "VISIBILITY_ENABLED",
              "COMMUNICATION_READY"
            ]
          },
          scoringConfig: {
            participatesInScoring: false
          },
          colSpan: 2,
          behaviors: [
            {
              workflowState: "VISIBILITY_ENABLED",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "COMMUNICATION_READY",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "COMMUNICATION_SENT",
              role: "DIRECTOR",
              visibility: "VISIBLE",
              editability: "READ_ONLY",
              mandatory: false
            }
          ],
          options: []
        },
        {
          fieldKey: "designation_name",
          fieldLabel: "Designation",
          fieldType: "SHORT_TEXT",
          fieldCategory: "NORMAL",
          isRequired: false,
          displayOrder: 4,
          placeholder: "",
          helpText: "",
          hideLabel: false,
          validationRules: {
            requiredFor: []
          },
          visibilityRules: {
            visibleTo: [
              "ADMIN",
              "DIRECTOR"
            ],
            hiddenFrom: [
              "EMPLOYEE",
              "MANAGER",
              "MANAGEMENT"
            ],
            hierarchyScopes: [
              "department",
              "business-unit",
              "region",
              "global"
            ],
            visibleStates: [
              "VISIBILITY_ENABLED",
              "COMMUNICATION_READY",
              "COMMUNICATION_SENT"
            ],
            publishFlagRequired: true,
            publishFlags: [
              "employeeGradeVisible"
            ]
          },
          editabilityRules: {
            editableBy: [
              "ADMIN"
            ],
            editableStates: [
              "VISIBILITY_ENABLED",
              "COMMUNICATION_READY"
            ]
          },
          scoringConfig: {
            participatesInScoring: false
          },
          colSpan: 2,
          behaviors: [
            {
              workflowState: "VISIBILITY_ENABLED",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "COMMUNICATION_READY",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "COMMUNICATION_SENT",
              role: "DIRECTOR",
              visibility: "VISIBLE",
              editability: "READ_ONLY",
              mandatory: false
            }
          ],
          options: []
        },
        {
          fieldKey: "joining_date",
          fieldLabel: "Joining Date",
          fieldType: "DATE",
          fieldCategory: "NORMAL",
          isRequired: false,
          displayOrder: 5,
          placeholder: "",
          helpText: "",
          hideLabel: false,
          validationRules: {
            requiredFor: []
          },
          visibilityRules: {
            visibleTo: [
              "ADMIN",
              "DIRECTOR"
            ],
            hiddenFrom: [
              "EMPLOYEE",
              "MANAGER",
              "MANAGEMENT"
            ],
            hierarchyScopes: [
              "department",
              "business-unit",
              "region",
              "global"
            ],
            visibleStates: [
              "VISIBILITY_ENABLED",
              "COMMUNICATION_READY",
              "COMMUNICATION_SENT"
            ],
            publishFlagRequired: true,
            publishFlags: [
              "employeeGradeVisible"
            ]
          },
          editabilityRules: {
            editableBy: [
              "ADMIN"
            ],
            editableStates: [
              "VISIBILITY_ENABLED",
              "COMMUNICATION_READY"
            ]
          },
          scoringConfig: {
            participatesInScoring: false
          },
          colSpan: 2,
          behaviors: [
            {
              workflowState: "VISIBILITY_ENABLED",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "COMMUNICATION_READY",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "COMMUNICATION_SENT",
              role: "DIRECTOR",
              visibility: "VISIBLE",
              editability: "READ_ONLY",
              mandatory: false
            }
          ],
          options: []
        },
        {
          fieldKey: "years_in_company",
          fieldLabel: "Years in Company",
          fieldType: "SHORT_TEXT",
          fieldCategory: "NORMAL",
          isRequired: false,
          displayOrder: 6,
          placeholder: "",
          helpText: "",
          hideLabel: false,
          validationRules: {
            requiredFor: []
          },
          visibilityRules: {
            visibleTo: [
              "ADMIN",
              "DIRECTOR"
            ],
            hiddenFrom: [
              "EMPLOYEE",
              "MANAGER",
              "MANAGEMENT"
            ],
            hierarchyScopes: [
              "department",
              "business-unit",
              "region",
              "global"
            ],
            visibleStates: [
              "VISIBILITY_ENABLED",
              "COMMUNICATION_READY",
              "COMMUNICATION_SENT"
            ],
            publishFlagRequired: true,
            publishFlags: [
              "employeeGradeVisible"
            ]
          },
          editabilityRules: {
            editableBy: [
              "ADMIN"
            ],
            editableStates: [
              "VISIBILITY_ENABLED",
              "COMMUNICATION_READY"
            ]
          },
          scoringConfig: {
            participatesInScoring: false
          },
          colSpan: 2,
          behaviors: [
            {
              workflowState: "VISIBILITY_ENABLED",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "COMMUNICATION_READY",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "COMMUNICATION_SENT",
              role: "DIRECTOR",
              visibility: "VISIBLE",
              editability: "READ_ONLY",
              mandatory: false
            }
          ],
          options: []
        },
        {
          fieldKey: "reporting_manager_name",
          fieldLabel: "Reporting Manager",
          fieldType: "SHORT_TEXT",
          fieldCategory: "NORMAL",
          isRequired: false,
          displayOrder: 7,
          placeholder: "",
          helpText: "",
          hideLabel: false,
          validationRules: {
            requiredFor: []
          },
          visibilityRules: {
            visibleTo: [
              "ADMIN",
              "DIRECTOR"
            ],
            hiddenFrom: [
              "EMPLOYEE",
              "MANAGER",
              "MANAGEMENT"
            ],
            hierarchyScopes: [
              "department",
              "business-unit",
              "region",
              "global"
            ],
            visibleStates: [
              "VISIBILITY_ENABLED",
              "COMMUNICATION_READY",
              "COMMUNICATION_SENT"
            ],
            publishFlagRequired: true,
            publishFlags: [
              "managerGradeVisible"
            ]
          },
          editabilityRules: {
            editableBy: [
              "ADMIN"
            ],
            editableStates: [
              "VISIBILITY_ENABLED",
              "COMMUNICATION_READY"
            ]
          },
          scoringConfig: {
            participatesInScoring: false
          },
          colSpan: 2,
          behaviors: [
            {
              workflowState: "VISIBILITY_ENABLED",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "COMMUNICATION_READY",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "COMMUNICATION_SENT",
              role: "DIRECTOR",
              visibility: "VISIBLE",
              editability: "READ_ONLY",
              mandatory: false
            }
          ],
          options: []
        },
        {
          fieldKey: "location_name",
          fieldLabel: "Location",
          fieldType: "SHORT_TEXT",
          fieldCategory: "NORMAL",
          isRequired: false,
          displayOrder: 8,
          placeholder: "",
          helpText: "",
          hideLabel: false,
          validationRules: {
            requiredFor: []
          },
          visibilityRules: {
            visibleTo: [
              "ADMIN",
              "DIRECTOR"
            ],
            hiddenFrom: [
              "EMPLOYEE",
              "MANAGER",
              "MANAGEMENT"
            ],
            hierarchyScopes: [
              "department",
              "business-unit",
              "region",
              "global"
            ],
            visibleStates: [
              "VISIBILITY_ENABLED",
              "COMMUNICATION_READY",
              "COMMUNICATION_SENT"
            ],
            publishFlagRequired: true,
            publishFlags: [
              "employeeGradeVisible"
            ]
          },
          editabilityRules: {
            editableBy: [
              "ADMIN"
            ],
            editableStates: [
              "VISIBILITY_ENABLED",
              "COMMUNICATION_READY"
            ]
          },
          scoringConfig: {
            participatesInScoring: false
          },
          colSpan: 2,
          behaviors: [
            {
              workflowState: "VISIBILITY_ENABLED",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "COMMUNICATION_READY",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "COMMUNICATION_SENT",
              role: "DIRECTOR",
              visibility: "VISIBLE",
              editability: "READ_ONLY",
              mandatory: false
            }
          ],
          options: []
        },
        {
          fieldKey: "qualification_name",
          fieldLabel: "Qualification",
          fieldType: "SHORT_TEXT",
          fieldCategory: "NORMAL",
          isRequired: false,
          displayOrder: 9,
          placeholder: "",
          helpText: "",
          hideLabel: false,
          validationRules: {
            requiredFor: []
          },
          visibilityRules: {
            visibleTo: [
              "ADMIN",
              "DIRECTOR"
            ],
            hiddenFrom: [
              "EMPLOYEE",
              "MANAGER",
              "MANAGEMENT"
            ],
            hierarchyScopes: [
              "department",
              "business-unit",
              "region",
              "global"
            ],
            visibleStates: [
              "VISIBILITY_ENABLED",
              "COMMUNICATION_READY",
              "COMMUNICATION_SENT"
            ],
            publishFlagRequired: true,
            publishFlags: [
              "employeeGradeVisible"
            ]
          },
          editabilityRules: {
            editableBy: [
              "ADMIN"
            ],
            editableStates: [
              "VISIBILITY_ENABLED",
              "COMMUNICATION_READY"
            ]
          },
          scoringConfig: {
            participatesInScoring: false
          },
          colSpan: 2,
          behaviors: [
            {
              workflowState: "VISIBILITY_ENABLED",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "COMMUNICATION_READY",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "COMMUNICATION_SENT",
              role: "DIRECTOR",
              visibility: "VISIBLE",
              editability: "READ_ONLY",
              mandatory: false
            }
          ],
          options: []
        }
      ]
    },
    {
      sectionKey: "quarterly_objectives",
      sectionLabel: "Assessment Term Objectives",
      sectionType: "OBJECTIVES",
      level: "QUARTER",
      repeatFor: [
        "Q1",
        "Q2",
        "Q3",
        "Q4",
        "H1",
        "H2",
        "Y1"
      ],
      repeatable: true,
      displayOrder: 2,
      layout: "vertical",
      renderingScope: "QUARTER_ONLY",
      quarterScope: [
        "Q1",
        "Q2",
        "Q3",
        "Q4",
        "H1",
        "H2",
        "Y1"
      ],
      sectionScoringConfig: {
        participatesInScoring: false,
        weightage: 0,
        aggregationMethod: "WEIGHTED_AVERAGE",
        maxSectionScore: 100
      },
      objectiveConfig: {
        mode: "HYBRID",
        allowEmployeeCreated: true,
        allowManagerCreated: true,
        predefinedObjectives: [
          {
            objectiveKey: "objective_1",
            title: "Safety compliance",
            description: "Safety compliance - refine target values during objective setting.",
            weightage: 16,
            quarterScope: [],
            applicableQuarters: [],
            repeatFor: []
          },
          {
            objectiveKey: "objective_2",
            title: "Production output",
            description: "Production output - refine target values during objective setting.",
            weightage: 14,
            quarterScope: [],
            applicableQuarters: [],
            repeatFor: []
          },
          {
            objectiveKey: "objective_3",
            title: "Quality of work",
            description: "Quality of work - refine target values during objective setting.",
            weightage: 14,
            quarterScope: [],
            applicableQuarters: [],
            repeatFor: []
          },
          {
            objectiveKey: "objective_4",
            title: "Attendance and discipline",
            description: "Attendance and discipline - refine target values during objective setting.",
            weightage: 14,
            quarterScope: [],
            applicableQuarters: [],
            repeatFor: []
          },
          {
            objectiveKey: "objective_5",
            title: "Machine handling",
            description: "Machine handling - refine target values during objective setting.",
            weightage: 14,
            quarterScope: [],
            applicableQuarters: [],
            repeatFor: []
          },
          {
            objectiveKey: "objective_6",
            title: "Housekeeping / 5S",
            description: "Housekeeping / 5S - refine target values during objective setting.",
            weightage: 14,
            quarterScope: [],
            applicableQuarters: [],
            repeatFor: []
          },
          {
            objectiveKey: "objective_7",
            title: "Skill improvement",
            description: "Skill improvement - refine target values during objective setting.",
            weightage: 14,
            quarterScope: [],
            applicableQuarters: [],
            repeatFor: []
          }
        ]
      },
      objectiveBuckets: [
        {
          bucketKey: "template_predefined",
          label: "Template Predefined Objectives",
          source: "TEMPLATE_PREDEFINED",
          owner: "SYSTEM",
          bucketWeightage: 20,
          rowWeightMode: "FIXED_BY_TEMPLATE",
          editableBy: [
            "ADMIN"
          ],
          requiresManagerApproval: false,
          autoApprove: true
        },
        {
          bucketKey: "employee_dynamic",
          label: "Employee Objectives",
          source: "EMPLOYEE_DYNAMIC",
          owner: "EMPLOYEE",
          bucketWeightage: 50,
          rowWeightMode: "OWNER_ENTERED",
          editableBy: [
            "EMPLOYEE"
          ],
          requiresManagerApproval: true,
          autoApprove: false
        },
        {
          bucketKey: "manager_dynamic",
          label: "Manager Objectives",
          source: "MANAGER_DYNAMIC",
          owner: "MANAGER",
          bucketWeightage: 30,
          rowWeightMode: "OWNER_ENTERED",
          editableBy: [
            "MANAGER"
          ],
          requiresManagerApproval: false,
          autoApprove: true
        }
      ],
      metadata: {
        starterGenerated: true,
        starterKey: "quarterly_objectives",
        starterObjectiveSection: true,
        objectiveApplyToAllQuarters: true,
        objectiveApplicableQuarters: [
          "Q1",
          "Q2",
          "Q3",
          "Q4",
          "H1",
          "H2",
          "Y1"
        ],
        objectiveSimpleMode: true
      },
      fields: [
        {
          fieldKey: "objective_focus_area",
          fieldLabel: "Objective Focus Area",
          fieldType: "LONG_TEXT",
          fieldCategory: "NORMAL",
          isRequired: false,
          displayOrder: 1,
          placeholder: "Summarize the key objective focus for this assessment term",
          helpText: "",
          hideLabel: false,
          validationRules: {
            requiredFor: []
          },
          visibilityRules: {
            visibleTo: [
              "EMPLOYEE",
              "MANAGER",
              "ADMIN",
              "DIRECTOR"
            ],
            hiddenFrom: [
              "MANAGEMENT"
            ],
            hierarchyScopes: [
              "direct-report"
            ],
            visibleStates: [
              "OBJECTIVE_SETTING_OPEN",
              "OBJECTIVE_DRAFT",
              "OBJECTIVE_SUBMITTED",
              "OBJECTIVE_APPROVED",
              "EMPLOYEE_ACHIEVEMENT_OPEN"
            ],
            publishFlagRequired: false,
            publishFlags: []
          },
          editabilityRules: {
            editableBy: [
              "EMPLOYEE",
              "ADMIN"
            ],
            editableStates: [
              "OBJECTIVE_SETTING_OPEN"
            ]
          },
          scoringConfig: {
            participatesInScoring: false
          },
          colSpan: 4,
          behaviors: [
            {
              workflowState: "OBJECTIVE_SETTING_OPEN",
              role: "EMPLOYEE",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "OBJECTIVE_SETTING_OPEN",
              role: "MANAGER",
              visibility: "VISIBLE",
              editability: "READ_ONLY",
              mandatory: false
            },
            {
              workflowState: "OBJECTIVE_SETTING_OPEN",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "OBJECTIVE_APPROVED",
              role: "EMPLOYEE",
              visibility: "VISIBLE",
              editability: "READ_ONLY",
              mandatory: false
            }
          ],
          options: []
        },
        {
          fieldKey: "employee_support_needed",
          fieldLabel: "Support Needed",
          fieldType: "LONG_TEXT",
          fieldCategory: "NORMAL",
          isRequired: false,
          displayOrder: 2,
          placeholder: "Mention support or dependencies needed to complete the objective",
          helpText: "",
          hideLabel: false,
          validationRules: {
            requiredFor: []
          },
          visibilityRules: {
            visibleTo: [
              "EMPLOYEE",
              "MANAGER",
              "ADMIN",
              "DIRECTOR"
            ],
            hiddenFrom: [
              "MANAGEMENT"
            ],
            hierarchyScopes: [
              "direct-report"
            ],
            visibleStates: [
              "OBJECTIVE_SETTING_OPEN",
              "OBJECTIVE_DRAFT",
              "OBJECTIVE_SUBMITTED",
              "OBJECTIVE_APPROVED",
              "EMPLOYEE_ACHIEVEMENT_OPEN"
            ],
            publishFlagRequired: false,
            publishFlags: []
          },
          editabilityRules: {
            editableBy: [
              "EMPLOYEE",
              "ADMIN"
            ],
            editableStates: [
              "OBJECTIVE_SETTING_OPEN"
            ]
          },
          scoringConfig: {
            participatesInScoring: false
          },
          colSpan: 4,
          behaviors: [
            {
              workflowState: "OBJECTIVE_SETTING_OPEN",
              role: "EMPLOYEE",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "OBJECTIVE_SETTING_OPEN",
              role: "MANAGER",
              visibility: "VISIBLE",
              editability: "READ_ONLY",
              mandatory: false
            },
            {
              workflowState: "OBJECTIVE_SETTING_OPEN",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "OBJECTIVE_APPROVED",
              role: "EMPLOYEE",
              visibility: "VISIBLE",
              editability: "READ_ONLY",
              mandatory: false
            }
          ],
          options: []
        },
        {
          fieldKey: "objective_alignment_note",
          fieldLabel: "Objective Alignment Note",
          fieldType: "STATIC_TEXT",
          fieldCategory: "NORMAL",
          isRequired: false,
          displayOrder: 3,
          placeholder: "",
          helpText: "Use starter objectives as the baseline and refine them during the assessment term objective-setting window. Template applicability only. Actual cycle terms, dates, and windows are configured during cycle creation.",
          hideLabel: false,
          validationRules: {
            requiredFor: []
          },
          visibilityRules: {
            visibleTo: [
              "EMPLOYEE",
              "MANAGER",
              "ADMIN",
              "DIRECTOR"
            ],
            hiddenFrom: [
              "MANAGEMENT"
            ],
            hierarchyScopes: [
              "direct-report"
            ],
            visibleStates: [
              "OBJECTIVE_SETTING_OPEN",
              "OBJECTIVE_DRAFT",
              "OBJECTIVE_SUBMITTED",
              "OBJECTIVE_APPROVED",
              "EMPLOYEE_ACHIEVEMENT_OPEN"
            ],
            publishFlagRequired: false,
            publishFlags: []
          },
          editabilityRules: {
            editableBy: [
              "EMPLOYEE",
              "ADMIN"
            ],
            editableStates: [
              "OBJECTIVE_SETTING_OPEN"
            ]
          },
          scoringConfig: {
            participatesInScoring: false
          },
          colSpan: 4,
          behaviors: [
            {
              workflowState: "OBJECTIVE_SETTING_OPEN",
              role: "EMPLOYEE",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "OBJECTIVE_SETTING_OPEN",
              role: "MANAGER",
              visibility: "VISIBLE",
              editability: "READ_ONLY",
              mandatory: false
            },
            {
              workflowState: "OBJECTIVE_SETTING_OPEN",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "OBJECTIVE_APPROVED",
              role: "EMPLOYEE",
              visibility: "VISIBLE",
              editability: "READ_ONLY",
              mandatory: false
            }
          ],
          options: []
        }
      ]
    },
    {
      sectionKey: "employee_achievement_submission",
      sectionLabel: "Employee Achievement Submission",
      sectionType: "QUARTER_REVIEW",
      level: "QUARTER",
      repeatFor: [
        "Q1",
        "Q2",
        "Q3",
        "Q4",
        "H1",
        "H2",
        "Y1"
      ],
      repeatable: true,
      displayOrder: 3,
      layout: "vertical",
      renderingScope: "QUARTER_ONLY",
      quarterScope: [
        "Q1",
        "Q2",
        "Q3",
        "Q4",
        "H1",
        "H2",
        "Y1"
      ],
      sectionScoringConfig: {
        participatesInScoring: false,
        weightage: 0,
        aggregationMethod: "WEIGHTED_AVERAGE",
        maxSectionScore: 100
      },
      metadata: {
        starterGenerated: true,
        starterKey: "employee_achievement_submission",
        starterAchievementSection: true,
        employeeAchievementEnabled: true,
        achievementSubmissionRequired: true,
        allowManagerReviewWithoutAchievement: true,
        managerCanEditEmployeeAchievement: false
      },
      fields: [
        {
          fieldKey: "achievement_items",
          fieldLabel: "Achievement Items",
          fieldType: "DATA_GRID",
          fieldCategory: "NORMAL",
          isRequired: false,
          displayOrder: 1,
          placeholder: "",
          helpText: "",
          hideLabel: false,
          validationRules: {
            requiredFor: []
          },
          visibilityRules: {
            visibleTo: [
              "EMPLOYEE",
              "MANAGER",
              "ADMIN"
            ],
            hiddenFrom: [
              "MANAGEMENT",
              "DIRECTOR"
            ],
            hierarchyScopes: [
              "direct-report"
            ],
            visibleStates: [
              "EMPLOYEE_ACHIEVEMENT_OPEN",
              "MANAGER_REVIEW_OPEN",
              "QUARTER_FINALIZED"
            ],
            publishFlagRequired: false,
            publishFlags: []
          },
          editabilityRules: {
            editableBy: [
              "EMPLOYEE",
              "ADMIN"
            ],
            editableStates: [
              "OBJECTIVE_APPROVED",
              "MANAGER_REVIEW_OPEN"
            ]
          },
          scoringConfig: {
            participatesInScoring: false
          },
          colSpan: 4,
          behaviors: [
            {
              workflowState: "OBJECTIVE_APPROVED",
              role: "EMPLOYEE",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "OBJECTIVE_APPROVED",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "OBJECTIVE_APPROVED",
              role: "MANAGER",
              visibility: "VISIBLE",
              editability: "READ_ONLY",
              mandatory: false
            },
            {
              workflowState: "MANAGER_REVIEW_OPEN",
              role: "EMPLOYEE",
              visibility: "VISIBLE",
              editability: "READ_ONLY",
              mandatory: false
            },
            {
              workflowState: "MANAGER_REVIEW_OPEN",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "MANAGER_REVIEW_OPEN",
              role: "MANAGER",
              visibility: "VISIBLE",
              editability: "READ_ONLY",
              mandatory: false
            },
            {
              workflowState: "QUARTER_FINALIZED",
              role: "EMPLOYEE",
              visibility: "VISIBLE",
              editability: "READ_ONLY",
              mandatory: false
            },
            {
              workflowState: "QUARTER_FINALIZED",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "READ_ONLY",
              mandatory: false
            },
            {
              workflowState: "QUARTER_FINALIZED",
              role: "MANAGER",
              visibility: "VISIBLE",
              editability: "READ_ONLY",
              mandatory: false
            }
          ],
          options: [],
          gridConfig: {
            columns: [
              {
                key: "achievement_subject",
                label: "Achievement Subject",
                type: "text",
                required: true
              },
              {
                key: "achievement_description",
                label: "Achievement Description",
                type: "textarea",
                required: true
              },
              {
                key: "achievement_attachments",
                label: "Achievement Attachments",
                type: "attachment",
                required: false
              }
            ],
            minRows: 1
          }
        }
      ]
    },
    {
      sectionKey: "traits__competencies",
      sectionLabel: "Traits & Competencies",
      sectionType: "QUARTER_REVIEW",
      level: "QUARTER",
      repeatFor: [
        "Q1",
        "Q2",
        "Q3",
        "Q4",
        "H1",
        "H2",
        "Y1"
      ],
      repeatable: true,
      displayOrder: 4,
      layout: "vertical",
      renderingScope: "QUARTER_ONLY",
      quarterScope: [
        "Q1",
        "Q2",
        "Q3",
        "Q4",
        "H1",
        "H2",
        "Y1"
      ],
      sectionScoringConfig: {
        participatesInScoring: true,
        weightage: 100,
        aggregationMethod: "WEIGHTED_AVERAGE",
        maxSectionScore: 100
      },
      metadata: {
        starterGenerated: true,
        starterKey: "traits__competencies",
        starterCompetencySection: true,
        competencySimpleMode: true,
        titleAlignment: "center"
      },
      fields: [
        {
          fieldKey: "traits__competencies_matrix",
          fieldLabel: "Traits & Competencies",
          fieldType: "MATRIX",
          fieldCategory: "SCORING",
          isRequired: false,
          displayOrder: 1,
          placeholder: "",
          helpText: "",
          hideLabel: false,
          validationRules: {
            requiredFor: []
          },
          visibilityRules: {
            visibleTo: [
              "MANAGER",
              "ADMIN",
              "DIRECTOR"
            ],
            hiddenFrom: [
              "EMPLOYEE",
              "MANAGEMENT"
            ],
            hierarchyScopes: [
              "direct-report",
              "department"
            ],
            visibleStates: [
              "MANAGER_REVIEW_OPEN",
              "MANAGER_REVIEW_SUBMITTED",
              "QUARTER_FINALIZED"
            ],
            publishFlagRequired: false,
            publishFlags: []
          },
          editabilityRules: {
            editableBy: [
              "MANAGER",
              "ADMIN"
            ],
            editableStates: [
              "MANAGER_REVIEW_OPEN"
            ]
          },
          scoringConfig: {
            participatesInScoring: true,
            scoreType: "OPTION_BASED",
            maxScore: 100,
            weight: 100,
            optionScores: [
              {
                optionValue: "safety_awareness_1:inadequate",
                score: 25
              },
              {
                optionValue: "safety_awareness_1:needs_guidance",
                score: 50
              },
              {
                optionValue: "safety_awareness_1:works_independently",
                score: 75
              },
              {
                optionValue: "safety_awareness_1:excellent_up_to_date",
                score: 100
              },
              {
                optionValue: "productivity_2:inadequate",
                score: 25
              },
              {
                optionValue: "productivity_2:needs_guidance",
                score: 50
              },
              {
                optionValue: "productivity_2:works_independently",
                score: 75
              },
              {
                optionValue: "productivity_2:excellent_up_to_date",
                score: 100
              },
              {
                optionValue: "quality_of_work_3:inadequate",
                score: 25
              },
              {
                optionValue: "quality_of_work_3:needs_guidance",
                score: 50
              },
              {
                optionValue: "quality_of_work_3:works_independently",
                score: 75
              },
              {
                optionValue: "quality_of_work_3:excellent_up_to_date",
                score: 100
              },
              {
                optionValue: "discipline_4:inadequate",
                score: 25
              },
              {
                optionValue: "discipline_4:needs_guidance",
                score: 50
              },
              {
                optionValue: "discipline_4:works_independently",
                score: 75
              },
              {
                optionValue: "discipline_4:excellent_up_to_date",
                score: 100
              },
              {
                optionValue: "machineprocess_knowledge_5:inadequate",
                score: 25
              },
              {
                optionValue: "machineprocess_knowledge_5:needs_guidance",
                score: 50
              },
              {
                optionValue: "machineprocess_knowledge_5:works_independently",
                score: 75
              },
              {
                optionValue: "machineprocess_knowledge_5:excellent_up_to_date",
                score: 100
              },
              {
                optionValue: "team_cooperation_6:inadequate",
                score: 25
              },
              {
                optionValue: "team_cooperation_6:needs_guidance",
                score: 50
              },
              {
                optionValue: "team_cooperation_6:works_independently",
                score: 75
              },
              {
                optionValue: "team_cooperation_6:excellent_up_to_date",
                score: 100
              }
            ],
            weightage: 100
          },
          colSpan: 4,
          behaviors: [
            {
              workflowState: "MANAGER_REVIEW_OPEN",
              role: "MANAGER",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "MANAGER_REVIEW_OPEN",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "QUARTER_FINALIZED",
              role: "MANAGER",
              visibility: "VISIBLE",
              editability: "READ_ONLY",
              mandatory: false
            }
          ],
          options: [],
          matrixConfig: {
            rows: [
              {
                key: "safety_awareness_1",
                label: "Safety awareness",
                weightage: 17,
                options: [
                  {
                    label: "Inadequate",
                    value: "inadequate",
                    score: 25,
                    weight: 25
                  },
                  {
                    label: "Needs guidance",
                    value: "needs_guidance",
                    score: 50,
                    weight: 50
                  },
                  {
                    label: "Can work independently",
                    value: "works_independently",
                    score: 75,
                    weight: 75
                  },
                  {
                    label: "Excellent - keeps up to date",
                    value: "excellent_up_to_date",
                    score: 100,
                    weight: 100
                  }
                ]
              },
              {
                key: "productivity_2",
                label: "Productivity",
                weightage: 17,
                options: [
                  {
                    label: "Inadequate",
                    value: "inadequate",
                    score: 25,
                    weight: 25
                  },
                  {
                    label: "Needs guidance",
                    value: "needs_guidance",
                    score: 50,
                    weight: 50
                  },
                  {
                    label: "Can work independently",
                    value: "works_independently",
                    score: 75,
                    weight: 75
                  },
                  {
                    label: "Excellent - keeps up to date",
                    value: "excellent_up_to_date",
                    score: 100,
                    weight: 100
                  }
                ]
              },
              {
                key: "quality_of_work_3",
                label: "Quality of work",
                weightage: 17,
                options: [
                  {
                    label: "Inadequate",
                    value: "inadequate",
                    score: 25,
                    weight: 25
                  },
                  {
                    label: "Needs guidance",
                    value: "needs_guidance",
                    score: 50,
                    weight: 50
                  },
                  {
                    label: "Can work independently",
                    value: "works_independently",
                    score: 75,
                    weight: 75
                  },
                  {
                    label: "Excellent - keeps up to date",
                    value: "excellent_up_to_date",
                    score: 100,
                    weight: 100
                  }
                ]
              },
              {
                key: "discipline_4",
                label: "Discipline",
                weightage: 17,
                options: [
                  {
                    label: "Inadequate",
                    value: "inadequate",
                    score: 25,
                    weight: 25
                  },
                  {
                    label: "Needs guidance",
                    value: "needs_guidance",
                    score: 50,
                    weight: 50
                  },
                  {
                    label: "Can work independently",
                    value: "works_independently",
                    score: 75,
                    weight: 75
                  },
                  {
                    label: "Excellent - keeps up to date",
                    value: "excellent_up_to_date",
                    score: 100,
                    weight: 100
                  }
                ]
              },
              {
                key: "machineprocess_knowledge_5",
                label: "Machine/process knowledge",
                weightage: 16,
                options: [
                  {
                    label: "Inadequate",
                    value: "inadequate",
                    score: 25,
                    weight: 25
                  },
                  {
                    label: "Needs guidance",
                    value: "needs_guidance",
                    score: 50,
                    weight: 50
                  },
                  {
                    label: "Can work independently",
                    value: "works_independently",
                    score: 75,
                    weight: 75
                  },
                  {
                    label: "Excellent - keeps up to date",
                    value: "excellent_up_to_date",
                    score: 100,
                    weight: 100
                  }
                ]
              },
              {
                key: "team_cooperation_6",
                label: "Team cooperation",
                weightage: 16,
                options: [
                  {
                    label: "Inadequate",
                    value: "inadequate",
                    score: 25,
                    weight: 25
                  },
                  {
                    label: "Needs guidance",
                    value: "needs_guidance",
                    score: 50,
                    weight: 50
                  },
                  {
                    label: "Can work independently",
                    value: "works_independently",
                    score: 75,
                    weight: 75
                  },
                  {
                    label: "Excellent - keeps up to date",
                    value: "excellent_up_to_date",
                    score: 100,
                    weight: 100
                  }
                ]
              }
            ],
            columns: [
              {
                key: "rating_choice",
                label: "Please tick ( ) where box is provided"
              },
              {
                key: "explanatory_comments",
                label: "Explanatory Comments"
              }
            ],
            allowComments: true,
            selectionControl: "radio",
            multiSelectScoring: "MAX",
            borderStyle: "paper"
          }
        }
      ]
    },
    {
      sectionKey: "objective_achievement_manager_review",
      sectionLabel: "Objective Achievement / Manager Review",
      sectionType: "QUARTER_REVIEW",
      level: "QUARTER",
      repeatFor: [
        "Q1",
        "Q2",
        "Q3",
        "Q4",
        "H1",
        "H2",
        "Y1"
      ],
      repeatable: true,
      displayOrder: 5,
      layout: "vertical",
      renderingScope: "QUARTER_ONLY",
      quarterScope: [
        "Q1",
        "Q2",
        "Q3",
        "Q4",
        "H1",
        "H2",
        "Y1"
      ],
      sectionScoringConfig: {
        participatesInScoring: false,
        weightage: 0,
        aggregationMethod: "WEIGHTED_AVERAGE",
        maxSectionScore: 100
      },
      metadata: {
        starterGenerated: true,
        starterKey: "objective_achievement_manager_review"
      },
      fields: [
        {
          fieldKey: "achievement_summary",
          fieldLabel: "Achievement Summary",
          fieldType: "LONG_TEXT",
          fieldCategory: "NORMAL",
          isRequired: false,
          displayOrder: 1,
          placeholder: "Record completed production targets, machine uptime support, and improvement suggestions.",
          helpText: "",
          hideLabel: false,
          validationRules: {
            requiredFor: []
          },
          visibilityRules: {
            visibleTo: [
              "MANAGER",
              "ADMIN",
              "DIRECTOR"
            ],
            hiddenFrom: [
              "EMPLOYEE",
              "MANAGEMENT"
            ],
            hierarchyScopes: [
              "direct-report",
              "department"
            ],
            visibleStates: [
              "MANAGER_REVIEW_OPEN",
              "MANAGER_REVIEW_SUBMITTED",
              "QUARTER_FINALIZED"
            ],
            publishFlagRequired: false,
            publishFlags: []
          },
          editabilityRules: {
            editableBy: [
              "MANAGER",
              "ADMIN"
            ],
            editableStates: [
              "MANAGER_REVIEW_OPEN"
            ]
          },
          scoringConfig: {
            participatesInScoring: false
          },
          colSpan: 4,
          behaviors: [
            {
              workflowState: "MANAGER_REVIEW_OPEN",
              role: "MANAGER",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "MANAGER_REVIEW_OPEN",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "QUARTER_FINALIZED",
              role: "MANAGER",
              visibility: "VISIBLE",
              editability: "READ_ONLY",
              mandatory: false
            }
          ],
          options: []
        },
        {
          fieldKey: "manager_overall_rating",
          fieldLabel: "Manager Overall Rating",
          fieldType: "DROPDOWN",
          fieldCategory: "NORMAL",
          isRequired: false,
          displayOrder: 2,
          placeholder: "",
          helpText: "",
          hideLabel: false,
          validationRules: {
            requiredFor: []
          },
          visibilityRules: {
            visibleTo: [
              "MANAGER",
              "ADMIN",
              "DIRECTOR"
            ],
            hiddenFrom: [
              "EMPLOYEE",
              "MANAGEMENT"
            ],
            hierarchyScopes: [
              "direct-report",
              "department"
            ],
            visibleStates: [
              "MANAGER_REVIEW_OPEN",
              "MANAGER_REVIEW_SUBMITTED",
              "QUARTER_FINALIZED"
            ],
            publishFlagRequired: false,
            publishFlags: []
          },
          editabilityRules: {
            editableBy: [
              "MANAGER",
              "ADMIN"
            ],
            editableStates: [
              "MANAGER_REVIEW_OPEN"
            ]
          },
          scoringConfig: {
            participatesInScoring: false,
            optionScores: [
              {
                optionValue: "needs_improvement",
                score: 20
              },
              {
                optionValue: "meets_expectation",
                score: 40
              },
              {
                optionValue: "good",
                score: 60
              },
              {
                optionValue: "very_good",
                score: 80
              },
              {
                optionValue: "excellent",
                score: 100
              }
            ]
          },
          colSpan: 4,
          behaviors: [
            {
              workflowState: "MANAGER_REVIEW_OPEN",
              role: "MANAGER",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "MANAGER_REVIEW_OPEN",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "QUARTER_FINALIZED",
              role: "MANAGER",
              visibility: "VISIBLE",
              editability: "READ_ONLY",
              mandatory: false
            }
          ],
          options: [
            {
              label: "Needs Improvement",
              value: "needs_improvement",
              score: 20,
              weight: 20
            },
            {
              label: "Meets Expectation",
              value: "meets_expectation",
              score: 40,
              weight: 40
            },
            {
              label: "Good",
              value: "good",
              score: 60,
              weight: 60
            },
            {
              label: "Very Good",
              value: "very_good",
              score: 80,
              weight: 80
            },
            {
              label: "Excellent",
              value: "excellent",
              score: 100,
              weight: 100
            }
          ]
        },
        {
          fieldKey: "manager_comments",
          fieldLabel: "Manager Comments",
          fieldType: "LONG_TEXT",
          fieldCategory: "NORMAL",
          isRequired: false,
          displayOrder: 3,
          placeholder: "Add manager observations, coaching points, and review notes",
          helpText: "",
          hideLabel: false,
          validationRules: {
            requiredFor: []
          },
          visibilityRules: {
            visibleTo: [
              "MANAGER",
              "ADMIN",
              "DIRECTOR"
            ],
            hiddenFrom: [
              "EMPLOYEE",
              "MANAGEMENT"
            ],
            hierarchyScopes: [
              "direct-report",
              "department"
            ],
            visibleStates: [
              "MANAGER_REVIEW_OPEN",
              "MANAGER_REVIEW_SUBMITTED",
              "QUARTER_FINALIZED"
            ],
            publishFlagRequired: false,
            publishFlags: []
          },
          editabilityRules: {
            editableBy: [
              "MANAGER",
              "ADMIN"
            ],
            editableStates: [
              "MANAGER_REVIEW_OPEN"
            ]
          },
          scoringConfig: {
            participatesInScoring: false
          },
          colSpan: 4,
          behaviors: [
            {
              workflowState: "MANAGER_REVIEW_OPEN",
              role: "MANAGER",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "MANAGER_REVIEW_OPEN",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "QUARTER_FINALIZED",
              role: "MANAGER",
              visibility: "VISIBLE",
              editability: "READ_ONLY",
              mandatory: false
            }
          ],
          options: []
        }
      ]
    },
    {
      sectionKey: "annual_production_appraisal_decision",
      sectionLabel: "Annual Production Appraisal Decision",
      sectionType: "ANNUAL_SUMMARY",
      level: "ANNUAL",
      repeatFor: [],
      repeatable: false,
      displayOrder: 6,
      layout: "vertical",
      renderingScope: "ANNUAL_ONLY",
      quarterScope: [],
      sectionScoringConfig: {
        participatesInScoring: false,
        weightage: 0,
        aggregationMethod: "WEIGHTED_AVERAGE",
        maxSectionScore: 100
      },
      metadata: {
        starterGenerated: true,
        starterKey: "annual_production_appraisal_decision"
      },
      fields: [
        {
          fieldKey: "annual_overall_rating",
          fieldLabel: "Annual Overall Rating",
          fieldType: "DROPDOWN",
          fieldCategory: "NORMAL",
          isRequired: false,
          displayOrder: 1,
          placeholder: "",
          helpText: "",
          hideLabel: false,
          validationRules: {
            requiredFor: []
          },
          visibilityRules: {
            visibleTo: [
              "MANAGEMENT",
              "ADMIN",
              "DIRECTOR"
            ],
            hiddenFrom: [
              "EMPLOYEE",
              "MANAGER"
            ],
            hierarchyScopes: [
              "department",
              "business-unit",
              "region",
              "global"
            ],
            visibleStates: [
              "MANAGEMENT_DECISION_DRAFT",
              "MANAGEMENT_DECISION_SUBMITTED",
              "VISIBILITY_ENABLED"
            ],
            publishFlagRequired: true,
            publishFlags: [
              "employeeGradeVisible"
            ]
          },
          editabilityRules: {
            editableBy: [
              "MANAGEMENT",
              "ADMIN"
            ],
            editableStates: [
              "MANAGEMENT_DECISION_DRAFT"
            ]
          },
          scoringConfig: {
            participatesInScoring: false,
            optionScores: [
              {
                optionValue: "needs_improvement",
                score: 20
              },
              {
                optionValue: "meets_expectation",
                score: 40
              },
              {
                optionValue: "good",
                score: 60
              },
              {
                optionValue: "very_good",
                score: 80
              },
              {
                optionValue: "excellent",
                score: 100
              }
            ]
          },
          colSpan: 4,
          behaviors: [
            {
              workflowState: "MANAGEMENT_DECISION_DRAFT",
              role: "MANAGEMENT",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "MANAGEMENT_DECISION_DRAFT",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "VISIBILITY_ENABLED",
              role: "DIRECTOR",
              visibility: "VISIBLE",
              editability: "READ_ONLY",
              mandatory: false
            }
          ],
          options: [
            {
              label: "Needs Improvement",
              value: "needs_improvement",
              score: 20,
              weight: 20
            },
            {
              label: "Meets Expectation",
              value: "meets_expectation",
              score: 40,
              weight: 40
            },
            {
              label: "Good",
              value: "good",
              score: 60,
              weight: 60
            },
            {
              label: "Very Good",
              value: "very_good",
              score: 80,
              weight: 80
            },
            {
              label: "Excellent",
              value: "excellent",
              score: 100,
              weight: 100
            }
          ]
        },
        {
          fieldKey: "merit_recommendation",
          fieldLabel: "Merit Recommendation",
          fieldType: "DROPDOWN",
          fieldCategory: "NORMAL",
          isRequired: false,
          displayOrder: 2,
          placeholder: "",
          helpText: "",
          hideLabel: false,
          validationRules: {
            requiredFor: []
          },
          visibilityRules: {
            visibleTo: [
              "MANAGEMENT",
              "ADMIN",
              "DIRECTOR"
            ],
            hiddenFrom: [
              "EMPLOYEE",
              "MANAGER"
            ],
            hierarchyScopes: [
              "department",
              "business-unit",
              "region",
              "global"
            ],
            visibleStates: [
              "MANAGEMENT_DECISION_DRAFT",
              "MANAGEMENT_DECISION_SUBMITTED",
              "VISIBILITY_ENABLED"
            ],
            publishFlagRequired: true,
            publishFlags: [
              "employeeMeritVisible"
            ]
          },
          editabilityRules: {
            editableBy: [
              "MANAGEMENT",
              "ADMIN"
            ],
            editableStates: [
              "MANAGEMENT_DECISION_DRAFT"
            ]
          },
          scoringConfig: {
            participatesInScoring: false
          },
          colSpan: 4,
          behaviors: [
            {
              workflowState: "MANAGEMENT_DECISION_DRAFT",
              role: "MANAGEMENT",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "MANAGEMENT_DECISION_DRAFT",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "VISIBILITY_ENABLED",
              role: "DIRECTOR",
              visibility: "VISIBLE",
              editability: "READ_ONLY",
              mandatory: false
            }
          ],
          options: [
            {
              label: "No change",
              value: "no_change"
            },
            {
              label: "Merit applied",
              value: "merit_applied"
            },
            {
              label: "Promotion review",
              value: "promotion_review"
            }
          ]
        },
        {
          fieldKey: "management_remarks",
          fieldLabel: "Management Remarks",
          fieldType: "LONG_TEXT",
          fieldCategory: "NORMAL",
          isRequired: false,
          displayOrder: 3,
          placeholder: "Add final annual remarks and decision notes",
          helpText: "",
          hideLabel: false,
          validationRules: {
            requiredFor: []
          },
          visibilityRules: {
            visibleTo: [
              "MANAGEMENT",
              "ADMIN",
              "DIRECTOR"
            ],
            hiddenFrom: [
              "EMPLOYEE",
              "MANAGER"
            ],
            hierarchyScopes: [
              "department",
              "business-unit",
              "region",
              "global"
            ],
            visibleStates: [
              "MANAGEMENT_DECISION_DRAFT",
              "MANAGEMENT_DECISION_SUBMITTED",
              "VISIBILITY_ENABLED"
            ],
            publishFlagRequired: true,
            publishFlags: [
              "employeeGradeVisible"
            ]
          },
          editabilityRules: {
            editableBy: [
              "MANAGEMENT",
              "ADMIN"
            ],
            editableStates: [
              "MANAGEMENT_DECISION_DRAFT"
            ]
          },
          scoringConfig: {
            participatesInScoring: false
          },
          colSpan: 4,
          behaviors: [
            {
              workflowState: "MANAGEMENT_DECISION_DRAFT",
              role: "MANAGEMENT",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "MANAGEMENT_DECISION_DRAFT",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "VISIBILITY_ENABLED",
              role: "DIRECTOR",
              visibility: "VISIBLE",
              editability: "READ_ONLY",
              mandatory: false
            }
          ],
          options: []
        }
      ]
    },
    {
      sectionKey: "communication_governance",
      sectionLabel: "Communication Governance",
      sectionType: "VISIBILITY_GOVERNANCE",
      level: "ANNUAL",
      repeatFor: [],
      repeatable: false,
      displayOrder: 7,
      layout: "vertical",
      renderingScope: "ANNUAL_ONLY",
      quarterScope: [],
      sectionScoringConfig: {
        participatesInScoring: false,
        weightage: 0,
        aggregationMethod: "WEIGHTED_AVERAGE",
        maxSectionScore: 100
      },
      metadata: {
        starterGenerated: true,
        starterKey: "communication_governance"
      },
      fields: [
        {
          fieldKey: "employee_visibility_note",
          fieldLabel: "Employee Visibility Note",
          fieldType: "STATIC_TEXT",
          fieldCategory: "NORMAL",
          isRequired: false,
          displayOrder: 1,
          placeholder: "",
          helpText: "Employee communication should be released only after annual visibility is enabled through the PMS decision workflow.",
          hideLabel: false,
          validationRules: {
            requiredFor: []
          },
          visibilityRules: {
            visibleTo: [
              "ADMIN",
              "DIRECTOR"
            ],
            hiddenFrom: [
              "EMPLOYEE",
              "MANAGER",
              "MANAGEMENT"
            ],
            hierarchyScopes: [
              "department",
              "business-unit",
              "region",
              "global"
            ],
            visibleStates: [
              "VISIBILITY_ENABLED",
              "COMMUNICATION_READY",
              "COMMUNICATION_SENT"
            ],
            publishFlagRequired: true,
            publishFlags: [
              "employeeGradeVisible"
            ]
          },
          editabilityRules: {
            editableBy: [
              "ADMIN"
            ],
            editableStates: [
              "VISIBILITY_ENABLED",
              "COMMUNICATION_READY"
            ]
          },
          scoringConfig: {
            participatesInScoring: false
          },
          colSpan: 4,
          behaviors: [
            {
              workflowState: "VISIBILITY_ENABLED",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "COMMUNICATION_READY",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "COMMUNICATION_SENT",
              role: "DIRECTOR",
              visibility: "VISIBLE",
              editability: "READ_ONLY",
              mandatory: false
            }
          ],
          options: []
        },
        {
          fieldKey: "communication_release_comment",
          fieldLabel: "Communication Release Comment",
          fieldType: "LONG_TEXT",
          fieldCategory: "NORMAL",
          isRequired: false,
          displayOrder: 2,
          placeholder: "Capture any internal release note or special communication instruction",
          helpText: "",
          hideLabel: false,
          validationRules: {
            requiredFor: []
          },
          visibilityRules: {
            visibleTo: [
              "ADMIN",
              "DIRECTOR"
            ],
            hiddenFrom: [
              "EMPLOYEE",
              "MANAGER",
              "MANAGEMENT"
            ],
            hierarchyScopes: [
              "department",
              "business-unit",
              "region",
              "global"
            ],
            visibleStates: [
              "VISIBILITY_ENABLED",
              "COMMUNICATION_READY",
              "COMMUNICATION_SENT"
            ],
            publishFlagRequired: true,
            publishFlags: [
              "employeeGradeVisible"
            ]
          },
          editabilityRules: {
            editableBy: [
              "ADMIN"
            ],
            editableStates: [
              "VISIBILITY_ENABLED",
              "COMMUNICATION_READY"
            ]
          },
          scoringConfig: {
            participatesInScoring: false
          },
          colSpan: 4,
          behaviors: [
            {
              workflowState: "VISIBILITY_ENABLED",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "COMMUNICATION_READY",
              role: "ADMIN",
              visibility: "VISIBLE",
              editability: "EDITABLE",
              mandatory: false
            },
            {
              workflowState: "COMMUNICATION_SENT",
              role: "DIRECTOR",
              visibility: "VISIBLE",
              editability: "READ_ONLY",
              mandatory: false
            }
          ],
          options: []
        }
      ]
    }
  ],
  isLocked: true,
  isDeleted: false,
  createdBy: ObjectId("6912fdf00ba77ccca78f6f8b"),
  version: 1,
  createdAt: ISODate("2026-06-16T18:01:46.530Z"),
  updatedAt: ISODate("2026-06-16T18:02:07.848Z"),
  __v: 2,
  annualScoringConfig: {
    aggregationMethod: "WEIGHTED_AVERAGE",
    assessmentTermType: "QUARTERLY",
    quarterWeights: {
      Q1: 25,
      Q2: 25,
      Q3: 25,
      Q4: 25
    },
    excludedQuarters: []
  },
  metadata: {
    starterTemplateType: "PRODUCTION_MANUFACTURING",
    reviewFlowMode: "ACHIEVEMENT_THEN_MANAGER",
    employeeAchievementConfig: {
      employeeAchievementEnabled: true,
      achievementSubmissionRequired: true,
      allowManagerReviewWithoutAchievement: true,
      managerCanEditEmployeeAchievement: false
    },
    permissionPresetRef: "STANDARD_PMS_PERMISSIONS",
    simpleScoringSettings: {
      enabled: true,
      objectiveWeight: 0,
      competencyWeight: 100,
      managerReviewWeight: 0,
      annualRollupMode: "EQUAL"
    },
    advancedConfigurationEdited: false
  },
  scoringConfig: {},
  themeConfig: {},
  updatedBy: ObjectId("6912fdf00ba77ccca78f6f8b"),
  activatedAt: ISODate("2026-06-16T18:02:07.830Z"),
  lockedAt: ISODate("2026-06-16T18:02:07.829Z")
}


annual_assignment 

{
  _id: ObjectId("6a318fe14cb4a92704eb6995"),
  employeeId: ObjectId("6a315c3350bdff4ac183d5ff"),
  assignedManagerId: ObjectId("6a16e3c5438d8535066b3f62"),
  cycleId: ObjectId("6a318fc94cb4a92704eb6979"),
  templateVersionId: ObjectId("6a318f8a4cb4a92704eb690c"),
  quarterAssignmentIds: [
    ObjectId("6a318fe14cb4a92704eb6998"),
    ObjectId("6a318fe14cb4a92704eb6999"),
    ObjectId("6a318fe14cb4a92704eb699a"),
    ObjectId("6a318fe14cb4a92704eb699b")
  ],
  annualState: "DRAFT",
  finalDecisionStatus: "DRAFT",
  applicableQuarters: [
    "Q1",
    "Q2",
    "Q3",
    "Q4"
  ],
  assignmentReason: "FULL_YEAR",
  employeeSnapshot: {
    employeeCode: "SA0001",
    name: "Sofia",
    email: "sofia@gmail.com",
    role: "STAFF",
    specificRole: "Junior Developer",
    departmentId: "production",
    location: "chennai",
    joiningDate: ISODate("2026-01-01T06:30:00.000Z"),
    employmentStatus: "confirmed",
    active: true
  },
  managerSnapshot: {
    managerId: ObjectId("6a16e3c5438d8535066b3f62"),
    employeeCode: "SA767678",
    name: "Aditiya",
    email: "aditiya@gmail.com",
    role: "MANAGER",
    specificRole: "General Manager – Production"
  },
  orgSnapshot: {
    departmentId: "production",
    location: "chennai",
    reportingManagerId: ObjectId("6a16e3c5438d8535066b3f62")
  },
  communicationStatus: "NOT_REQUIRED",
  isDeleted: false,
  createdBy: ObjectId("6912fdf00ba77ccca78f6f8b"),
  version: 1,
  visibility: {
    cacheSource: "visibility_configurations",
    employeeReviewVisible: false,
    employeeGradeVisible: false,
    employeeMeritVisible: false,
    managerGradeVisible: false,
    managerMeritVisible: false
  },
  createdAt: ISODate("2026-06-16T18:03:13.389Z"),
  updatedAt: ISODate("2026-06-16T18:03:13.421Z"),
  __v: 1
},
{
  _id: ObjectId("6a3190304cb4a92704eb6a37"),
  employeeId: ObjectId("6a315d6c50bdff4ac183d7a8"),
  assignedManagerId: ObjectId("6a2296be715287ceaf9081b6"),
  cycleId: ObjectId("6a3190134cb4a92704eb6a1d"),
  templateVersionId: ObjectId("6a318f8a4cb4a92704eb690c"),
  quarterAssignmentIds: [
    ObjectId("6a3190304cb4a92704eb6a3a"),
    ObjectId("6a3190304cb4a92704eb6a3b")
  ],
  annualState: "DRAFT",
  finalDecisionStatus: "DRAFT",
  applicableQuarters: [
    "H1",
    "H2"
  ],
  assignmentReason: "FULL_YEAR",
  employeeSnapshot: {
    employeeCode: "SA0004",
    name: "Marco",
    email: "marco@gmail.com",
    role: "STAFF",
    specificRole: "Junior Developer",
    departmentId: "rnd",
    location: "chennai",
    joiningDate: ISODate("2025-01-01T06:30:00.000Z"),
    employmentStatus: "confirmed",
    active: true
  },
  managerSnapshot: {
    managerId: ObjectId("6a2296be715287ceaf9081b6"),
    employeeCode: "D2727",
    name: "DINESH",
    email: "dinesh@gmail.com",
    role: "MANAGER",
    specificRole: "R&D Manager"
  },
  orgSnapshot: {
    departmentId: "rnd",
    location: "chennai",
    reportingManagerId: ObjectId("6a2296be715287ceaf9081b6")
  },
  communicationStatus: "NOT_REQUIRED",
  isDeleted: false,
  createdBy: ObjectId("6912fdf00ba77ccca78f6f8b"),
  version: 1,
  visibility: {
    cacheSource: "visibility_configurations",
    employeeReviewVisible: false,
    employeeGradeVisible: false,
    employeeMeritVisible: false,
    managerGradeVisible: false,
    managerMeritVisible: false
  },
  createdAt: ISODate("2026-06-16T18:04:32.366Z"),
  updatedAt: ISODate("2026-06-16T18:04:32.388Z"),
  __v: 1
},
{
  _id: ObjectId("6a3190774cb4a92704eb6abe"),
  employeeId: ObjectId("6a315e5450bdff4ac183d7f4"),
  assignedManagerId: ObjectId("69735bcc77ea11ab2d790594"),
  cycleId: ObjectId("6a31906b4cb4a92704eb6aa5"),
  templateVersionId: ObjectId("6a318f8a4cb4a92704eb690c"),
  quarterAssignmentIds: [
    ObjectId("6a3190784cb4a92704eb6ac1")
  ],
  annualState: "DRAFT",
  finalDecisionStatus: "DRAFT",
  applicableQuarters: [
    "Y1"
  ],
  assignmentReason: "FULL_YEAR",
  employeeSnapshot: {
    employeeCode: "SA0006",
    name: "Nolan",
    email: "nolan@gmail.com",
    role: "STAFF",
    specificRole: "Store Executive",
    departmentId: "production",
    location: "bangalore",
    joiningDate: ISODate("2025-09-11T06:30:00.000Z"),
    employmentStatus: "confirmed",
    active: true
  },
  managerSnapshot: {
    managerId: ObjectId("69735bcc77ea11ab2d790594"),
    employeeCode: "TS0001",
    name: "Rahul R",
    email: "rahul@zuno.com",
    role: "manager",
    specificRole: "Senior Accounts Executive"
  },
  orgSnapshot: {
    departmentId: "production",
    location: "bangalore",
    reportingManagerId: ObjectId("69735bcc77ea11ab2d790594")
  },
  communicationStatus: "NOT_REQUIRED",
  isDeleted: false,
  createdBy: ObjectId("6912fdf00ba77ccca78f6f8b"),
  version: 1,
  visibility: {
    cacheSource: "visibility_configurations",
    employeeReviewVisible: false,
    employeeGradeVisible: false,
    employeeMeritVisible: false,
    managerGradeVisible: false,
    managerMeritVisible: false
  },
  createdAt: ISODate("2026-06-16T18:05:43.998Z"),
  updatedAt: ISODate("2026-06-16T18:05:44.017Z"),
  __v: 1
}

quater_assignments

1.{annualAssignmentId:ObjectId('6a318fe14cb4a92704eb6995')}
[
  {
    _id: ObjectId("6a318fe14cb4a92704eb6998"),
    annualAssignmentId: ObjectId("6a318fe14cb4a92704eb6995"),
    cycleId: ObjectId("6a318fc94cb4a92704eb6979"),
    cycleQuarterId: ObjectId("6a318fc94cb4a92704eb697b"),
    employeeId: ObjectId("6a315c3350bdff4ac183d5ff"),
    assignedManagerId: ObjectId("6a16e3c5438d8535066b3f62"),
    templateVersionId: ObjectId("6a318f8a4cb4a92704eb690c"),
    quarterCode: "Q1",
    assessmentTermType: "QUARTERLY",
    termCode: "Q1",
    termLabel: "Q1",
    quarterState: "MANAGER_REVIEW_OPEN",
    isDeleted: false,
    createdBy: ObjectId("6912fdf00ba77ccca78f6f8b"),
    version: 2,
    __v: 0,
    createdAt: ISODate("2026-06-16T18:03:13.409Z"),
    updatedAt: ISODate("2026-06-16T18:17:57.859Z"),
    lastTransitionAt: ISODate("2026-06-16T18:17:57.858Z"),
    lastTransitionBy: ObjectId("6a315c3350bdff4ac183d5ff"),
    lastTransitionReason: "Employee achievement submission locked; manager review can begin",
    lastTransitionRole: "STAFF",
    previousQuarterState: "EMPLOYEE_ACHIEVEMENT_OPEN",
    updatedBy: ObjectId("6912fdf00ba77ccca78f6f8b"),
    quarterSummary: {}
  },
  {
    _id: ObjectId("6a318fe14cb4a92704eb6999"),
    annualAssignmentId: ObjectId("6a318fe14cb4a92704eb6995"),
    cycleId: ObjectId("6a318fc94cb4a92704eb6979"),
    cycleQuarterId: ObjectId("6a318fc94cb4a92704eb697c"),
    employeeId: ObjectId("6a315c3350bdff4ac183d5ff"),
    assignedManagerId: ObjectId("6a16e3c5438d8535066b3f62"),
    templateVersionId: ObjectId("6a318f8a4cb4a92704eb690c"),
    quarterCode: "Q2",
    assessmentTermType: "QUARTERLY",
    termCode: "Q2",
    termLabel: "Q2",
    quarterState: "EMPLOYEE_ACHIEVEMENT_OPEN",
    isDeleted: false,
    createdBy: ObjectId("6912fdf00ba77ccca78f6f8b"),
    version: 2,
    __v: 0,
    createdAt: ISODate("2026-06-16T18:03:13.409Z"),
    updatedAt: ISODate("2026-06-16T18:03:13.534Z"),
    lastTransitionAt: ISODate("2026-06-16T18:03:13.491Z"),
    lastTransitionBy: ObjectId("6912fdf00ba77ccca78f6f8b"),
    lastTransitionReason: "Seeded predefined objectives are approved during assignment launch",
    lastTransitionRole: "ADMIN",
    previousQuarterState: "NOT_STARTED",
    updatedBy: ObjectId("6912fdf00ba77ccca78f6f8b")
  },
  {
    _id: ObjectId("6a318fe14cb4a92704eb6999"),
    annualAssignmentId: ObjectId("6a318fe14cb4a92704eb6995"),
    cycleId: ObjectId("6a318fc94cb4a92704eb6979"),
    cycleQuarterId: ObjectId("6a318fc94cb4a92704eb697c"),
    employeeId: ObjectId("6a315c3350bdff4ac183d5ff"),
    assignedManagerId: ObjectId("6a16e3c5438d8535066b3f62"),
    templateVersionId: ObjectId("6a318f8a4cb4a92704eb690c"),
    quarterCode: "Q2",
    assessmentTermType: "QUARTERLY",
    termCode: "Q2",
    termLabel: "Q2",
    quarterState: "EMPLOYEE_ACHIEVEMENT_OPEN",
    isDeleted: false,
    createdBy: ObjectId("6912fdf00ba77ccca78f6f8b"),
    version: 2,
    __v: 0,
    createdAt: ISODate("2026-06-16T18:03:13.409Z"),
    updatedAt: ISODate("2026-06-16T18:03:13.534Z"),
    lastTransitionAt: ISODate("2026-06-16T18:03:13.491Z"),
    lastTransitionBy: ObjectId("6912fdf00ba77ccca78f6f8b"),
    lastTransitionReason: "Seeded predefined objectives are approved during assignment launch",
    lastTransitionRole: "ADMIN",
    previousQuarterState: "NOT_STARTED",
    updatedBy: ObjectId("6912fdf00ba77ccca78f6f8b")
  },
  {
    _id: ObjectId("6a318fe14cb4a92704eb699a"),
    annualAssignmentId: ObjectId("6a318fe14cb4a92704eb6995"),
    cycleId: ObjectId("6a318fc94cb4a92704eb6979"),
    cycleQuarterId: ObjectId("6a318fc94cb4a92704eb697d"),
    employeeId: ObjectId("6a315c3350bdff4ac183d5ff"),
    assignedManagerId: ObjectId("6a16e3c5438d8535066b3f62"),
    templateVersionId: ObjectId("6a318f8a4cb4a92704eb690c"),
    quarterCode: "Q3",
    assessmentTermType: "QUARTERLY",
    termCode: "Q3",
    termLabel: "Q3",
    quarterState: "EMPLOYEE_ACHIEVEMENT_OPEN",
    isDeleted: false,
    createdBy: ObjectId("6912fdf00ba77ccca78f6f8b"),
    version: 2,
    __v: 0,
    createdAt: ISODate("2026-06-16T18:03:13.409Z"),
    updatedAt: ISODate("2026-06-16T18:03:13.554Z"),
    lastTransitionAt: ISODate("2026-06-16T18:03:13.491Z"),
    lastTransitionBy: ObjectId("6912fdf00ba77ccca78f6f8b"),
    lastTransitionReason: "Seeded predefined objectives are approved during assignment launch",
    lastTransitionRole: "ADMIN",
    previousQuarterState: "NOT_STARTED",
    updatedBy: ObjectId("6912fdf00ba77ccca78f6f8b")
  }
]

2. {annualAssignmentId:ObjectId('6a3190304cb4a92704eb6a37')}

[
  {
    _id: ObjectId("6a3190304cb4a92704eb6a3a"),
    annualAssignmentId: ObjectId("6a3190304cb4a92704eb6a37"),
    cycleId: ObjectId("6a3190134cb4a92704eb6a1d"),
    cycleQuarterId: ObjectId("6a3190134cb4a92704eb6a1f"),
    employeeId: ObjectId("6a315d6c50bdff4ac183d7a8"),
    assignedManagerId: ObjectId("6a2296be715287ceaf9081b6"),
    templateVersionId: ObjectId("6a318f8a4cb4a92704eb690c"),
    quarterCode: "H1",
    assessmentTermType: "HALF_YEARLY",
    termCode: "H1",
    termLabel: "H1",
    quarterState: "EMPLOYEE_ACHIEVEMENT_OPEN",
    isDeleted: false,
    createdBy: ObjectId("6912fdf00ba77ccca78f6f8b"),
    version: 2,
    __v: 0,
    createdAt: ISODate("2026-06-16T18:04:32.380Z"),
    updatedAt: ISODate("2026-06-16T18:04:32.434Z"),
    lastTransitionAt: ISODate("2026-06-16T18:04:32.426Z"),
    lastTransitionBy: ObjectId("6912fdf00ba77ccca78f6f8b"),
    lastTransitionReason: "Seeded predefined objectives are approved during assignment launch",
    lastTransitionRole: "ADMIN",
    previousQuarterState: "NOT_STARTED",
    updatedBy: ObjectId("6912fdf00ba77ccca78f6f8b")
  },
  {
    _id: ObjectId("6a3190304cb4a92704eb6a3b"),
    annualAssignmentId: ObjectId("6a3190304cb4a92704eb6a37"),
    cycleId: ObjectId("6a3190134cb4a92704eb6a1d"),
    cycleQuarterId: ObjectId("6a3190134cb4a92704eb6a20"),
    employeeId: ObjectId("6a315d6c50bdff4ac183d7a8"),
    assignedManagerId: ObjectId("6a2296be715287ceaf9081b6"),
    templateVersionId: ObjectId("6a318f8a4cb4a92704eb690c"),
    quarterCode: "H2",
    assessmentTermType: "HALF_YEARLY",
    termCode: "H2",
    termLabel: "H2",
    quarterState: "EMPLOYEE_ACHIEVEMENT_OPEN",
    isDeleted: false,
    createdBy: ObjectId("6912fdf00ba77ccca78f6f8b"),
    version: 2,
    __v: 0,
    createdAt: ISODate("2026-06-16T18:04:32.380Z"),
    updatedAt: ISODate("2026-06-16T18:04:32.457Z"),
    lastTransitionAt: ISODate("2026-06-16T18:04:32.426Z"),
    lastTransitionBy: ObjectId("6912fdf00ba77ccca78f6f8b"),
    lastTransitionReason: "Seeded predefined objectives are approved during assignment launch",
    lastTransitionRole: "ADMIN",
    previousQuarterState: "NOT_STARTED",
    updatedBy: ObjectId("6912fdf00ba77ccca78f6f8b")
  }
]

3.{annualAssignmentId:ObjectId('6a3190774cb4a92704eb6abe')}
[
  {
    _id: ObjectId("6a3190784cb4a92704eb6ac1"),
    annualAssignmentId: ObjectId("6a3190774cb4a92704eb6abe"),
    cycleId: ObjectId("6a31906b4cb4a92704eb6aa5"),
    cycleQuarterId: ObjectId("6a31906b4cb4a92704eb6aa7"),
    employeeId: ObjectId("6a315e5450bdff4ac183d7f4"),
    assignedManagerId: ObjectId("69735bcc77ea11ab2d790594"),
    templateVersionId: ObjectId("6a318f8a4cb4a92704eb690c"),
    quarterCode: "Y1",
    assessmentTermType: "YEARLY",
    termCode: "Y1",
    termLabel: "Y1",
    quarterState: "EMPLOYEE_ACHIEVEMENT_OPEN",
    isDeleted: false,
    createdBy: ObjectId("6912fdf00ba77ccca78f6f8b"),
    version: 2,
    __v: 0,
    createdAt: ISODate("2026-06-16T18:05:44.010Z"),
    updatedAt: ISODate("2026-06-16T18:05:44.061Z"),
    lastTransitionAt: ISODate("2026-06-16T18:05:44.054Z"),
    lastTransitionBy: ObjectId("6912fdf00ba77ccca78f6f8b"),
    lastTransitionReason: "Seeded predefined objectives are approved during assignment launch",
    lastTransitionRole: "ADMIN",
    previousQuarterState: "NOT_STARTED",
    updatedBy: ObjectId("6912fdf00ba77ccca78f6f8b")
  }
]


employee_achievement_submissions

[
  {
    _id: ObjectId("6a319340bc421ee1eb9bfb80"),
    annualAssignmentId: ObjectId("6a318fe14cb4a92704eb6995"),
    quarterAssignmentId: ObjectId("6a318fe14cb4a92704eb6998"),
    cycleId: ObjectId("6a318fc94cb4a92704eb6979"),
    employeeId: ObjectId("6a315c3350bdff4ac183d5ff"),
    managerId: ObjectId("6a16e3c5438d8535066b3f62"),
    templateVersionId: ObjectId("6a318f8a4cb4a92704eb690c"),
    quarterCode: "Q1",
    achievementItems: [
      {
        subject: "5S",
        description: "Completed 5S certificate",
        attachments: [
          {
            fileName: "Screenshot 2026-06-16 at 11.07.59_AM.png",
            fileUrl: "https://storage.googleapis.com/pms-sample/6a315c3350bdff4ac183d5ff/EmployeeAchievement/1781633845273-c769d44b-ce16-4d41-9514-65b64923f7b3-Screenshot 2026-06-16 at 11.07.59_AM.png",
            fileType: "image/png",
            fileSize: 213262,
            documentId: "088735e6-8520-4340-8bfd-2d4caa61076c",
            uploadedAt: ISODate("2026-06-16T18:17:25.746Z")
          }
        ]
      }
    ],
    achievementValues: [
      {
        templateFieldId: "achievement_items",
        fieldKey: "achievement_items",
        sectionKey: "employee_achievement_submission",
        roleCode: "EMPLOYEE",
        actorUserId: ObjectId("6a315c3350bdff4ac183d5ff"),
        workflowStage: "ACHIEVEMENT_SUBMITTED",
        valueJson: [
          {
            subject: "5S",
            description: "Completed 5S certificate",
            attachments: [
              {
                fileName: "Screenshot 2026-06-16 at 11.07.59_AM.png",
                fileUrl: "https://storage.googleapis.com/pms-sample/6a315c3350bdff4ac183d5ff/EmployeeAchievement/1781633845273-c769d44b-ce16-4d41-9514-65b64923f7b3-Screenshot 2026-06-16 at 11.07.59_AM.png",
                fileType: "image/png",
                fileSize: 213262,
                documentId: "088735e6-8520-4340-8bfd-2d4caa61076c",
                uploadedAt: ISODate("2026-06-16T18:17:25.746Z")
              }
            ]
          }
        ],
        valueStatus: "ACTIVE",
        submittedAt: ISODate("2026-06-16T18:17:57.806Z")
      }
    ],
    status: "LOCKED",
    draftSavedAt: ISODate("2026-06-16T18:17:36.937Z"),
    auditMetadata: {
      todo: "Strict achievement window enforcement will be implemented in a later PMS v3.1 runtime change."
    },
    isDeleted: false,
    createdBy: ObjectId("6a315c3350bdff4ac183d5ff"),
    updatedBy: ObjectId("6a315c3350bdff4ac183d5ff"),
    version: 2,
    createdAt: ISODate("2026-06-16T18:17:36.948Z"),
    updatedAt: ISODate("2026-06-16T18:17:57.808Z"),
    __v: 0,
    lockedAt: ISODate("2026-06-16T18:17:57.807Z"),
    submittedAt: ISODate("2026-06-16T18:17:57.807Z"),
    submittedBy: ObjectId("6a315c3350bdff4ac183d5ff")
  }
]