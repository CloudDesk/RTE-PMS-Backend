import { Types } from 'mongoose';
import {
  PmsTemplateFieldType,
  PmsTemplateSectionLevel,
  PmsTemplateSectionType,
  PmsTemplateStatus,
} from '../../src/constants/pms.enums';
import {
  PmsTemplateVersion,
  type ITemplateObjectiveTableLayout,
  type ITemplateSection,
} from '../../src/models/pms-template-version.model';
import {
  normalizeObjectiveTableLayout,
  objectiveTableLayoutAuditSummary,
  objectiveTableLayoutValidationErrors,
} from '../../src/services/pms-template-objective-table-layout';
import { PmsTemplateService } from '../../src/services/pms-template.service';
import type { RequestContext } from '../../src/types/context';

function context(): RequestContext {
  return {
    requestId: 'template-objective-table-phase1-test',
    reqRole: 'ADMIN',
    user: {
      _id: '64b000000000000000000000001',
      email: 'admin@test.local',
      name: 'Admin',
      role: 'ADMIN',
      departmentId: '',
      active: true,
      country: '',
      currency: '',
      licenseType: '',
      portalAccess: true,
    },
  } as unknown as RequestContext;
}

function validLayout(): ITemplateObjectiveTableLayout {
  return {
    enabled: true,
    layoutVersion: 1,
    columns: [
      {
        columnId: 'col-objective',
        bindingKey: 'objective.title',
        label: 'Objective',
        type: PmsTemplateFieldType.SHORT_TEXT,
        displayOrder: 1,
        required: true,
        fillOwner: 'ROW_CREATOR',
        workflowStage: 'OBJECTIVE_SETTING',
        access: [
          { role: 'EMPLOYEE', visible: true, editable: true, required: true },
          { role: 'MANAGER', visible: true, editable: false, required: false },
        ],
      },
      {
        columnId: 'col-actual',
        bindingKey: 'custom.actual',
        label: 'Actual',
        type: PmsTemplateFieldType.NUMERIC_INPUT,
        displayOrder: 2,
        fillOwner: 'EMPLOYEE',
        workflowStage: 'EMPLOYEE_ACHIEVEMENT',
        access: [{ role: 'EMPLOYEE', visible: true, editable: true }],
      },
      {
        columnId: 'col-achievement',
        bindingKey: 'formula.achievement',
        label: 'Achievement %',
        type: PmsTemplateFieldType.FORMULA,
        displayOrder: 3,
        fillOwner: 'SYSTEM',
        workflowStage: 'CALCULATED',
        access: [{ role: 'EMPLOYEE', visible: true, editable: false }],
      },
    ],
    columnGroups: [
      {
        groupId: 'group-results',
        label: 'Results',
        columnIds: ['col-actual', 'col-achievement'],
        displayOrder: 1,
      },
    ],
    rowGroups: [
      { rowGroupKey: 'predefined', label: 'Company Objectives', source: 'PREDEFINED', displayOrder: 1 },
      { rowGroupKey: 'employee', label: 'Employee Objectives', source: 'EMPLOYEE_CREATED', displayOrder: 2 },
      { rowGroupKey: 'manager', label: 'Manager Objectives', source: 'MANAGER_CREATED', displayOrder: 3 },
    ],
    rowAssignments: [
      { objectiveKey: 'on-time-delivery', rowGroupKey: 'predefined', displayOrder: 1 },
    ],
    termPolicies: [
      { columnId: 'col-objective', mode: 'SHARED_ANNUAL' },
      { columnId: 'col-actual', mode: 'EVERY_REVIEW_PERIOD' },
      { columnId: 'col-achievement', mode: 'SELECTED_PERIODS', selectedTerms: ['Q1', 'Q2'] },
    ],
    formulas: [
      {
        formulaId: 'formula-achievement',
        targetColumnId: 'col-achievement',
        scope: 'ROW',
        ast: {
          type: 'FUNCTION',
          name: 'ROUND',
          arguments: [
            { type: 'COLUMN', columnId: 'col-actual' },
            { type: 'LITERAL', value: 2 },
          ],
        },
        emptyPolicy: 'IGNORE',
        divideByZeroPolicy: 'NULL',
        decimalPrecision: 2,
      },
    ],
    calculatedRows: [],
    dynamicRowPolicy: {
      employeeDefaultScope: 'CURRENT_TERM',
      managerDefaultScope: 'CURRENT_TERM',
      allowEmployeeTermChoice: false,
      allowManagerTermChoice: true,
    },
  };
}

function objectiveSection(layout: ITemplateObjectiveTableLayout): ITemplateSection {
  return {
    sectionKey: 'objectives',
    sectionLabel: 'Objectives',
    sectionType: PmsTemplateSectionType.OBJECTIVES,
    level: PmsTemplateSectionLevel.TERM,
    repeatFor: ['Q1', 'Q2', 'Q3', 'Q4'],
    renderingScope: 'TERM_ONLY',
    visibilityRules: { visibleTo: ['EMPLOYEE', 'MANAGER', 'ADMIN'] },
    editabilityRules: { editableBy: ['EMPLOYEE', 'MANAGER', 'ADMIN'] },
    objectiveConfig: {
      mode: 'HYBRID',
      allowEmployeeCreated: true,
      allowManagerCreated: true,
      managerCreatedAutoApprove: true,
      predefinedObjectives: [
        {
          objectiveKey: 'on-time-delivery',
          title: 'On-Time Delivery',
          columnValues: { 'custom.actual': 0 },
          rowGroupKey: 'predefined',
          rowOrder: 1,
        },
      ],
      tableLayout: layout,
    },
    objectiveBuckets: [
      {
        bucketKey: 'template_predefined',
        label: 'Admin Objectives',
        source: 'TEMPLATE_PREDEFINED',
        owner: 'SYSTEM',
        bucketWeightage: 34,
        rowWeightMode: 'FIXED_BY_TEMPLATE',
        editableBy: ['ADMIN'],
        requiresManagerApproval: false,
        autoApprove: true,
      },
      {
        bucketKey: 'employee_dynamic',
        label: 'Employee Objectives',
        source: 'EMPLOYEE_DYNAMIC',
        owner: 'EMPLOYEE',
        bucketWeightage: 33,
        rowWeightMode: 'OWNER_ENTERED',
        editableBy: ['EMPLOYEE'],
        requiresManagerApproval: true,
        autoApprove: false,
      },
      {
        bucketKey: 'manager_dynamic',
        label: 'Manager Objectives',
        source: 'MANAGER_DYNAMIC',
        owner: 'MANAGER',
        bucketWeightage: 33,
        rowWeightMode: 'OWNER_ENTERED',
        editableBy: ['MANAGER'],
        requiresManagerApproval: false,
        autoApprove: true,
      },
    ],
    fields: [
      {
        fieldKey: 'objective_notes',
        fieldLabel: 'Objective Notes',
        fieldType: PmsTemplateFieldType.LONG_TEXT,
        behaviors: [
          {
            role: 'EMPLOYEE',
            workflowState: 'OBJECTIVE_SETTING_OPEN',
            visibility: 'VISIBLE',
            editability: 'EDITABLE',
          },
          {
            role: 'MANAGER',
            workflowState: 'MANAGER_REVIEW_OPEN',
            visibility: 'VISIBLE',
            editability: 'READ_ONLY',
          },
        ],
      },
    ],
  };
}

describe('PMS template objective table layout Phase 1', () => {
  it('normalizes defaults and generates deterministic IDs only when absent', () => {
    const raw = {
      enabled: true,
      columns: [
        {
          bindingKey: 'custom.safetyObservation',
          label: 'Safety Observation',
          type: 'LONG_TEXT',
          fillOwner: 'employee',
          workflowStage: 'employee_achievement',
          termPolicy: 'CURRENT_PERIOD',
        },
      ],
      rowGroups: [],
      dynamicRowPolicy: {},
    };
    const first = normalizeObjectiveTableLayout(raw)!;
    const second = normalizeObjectiveTableLayout(raw)!;

    expect(first).toEqual(second);
    expect(first.columns[0].columnId).toBe('column-custom-safetyobservation');
    expect(first.columns[0].label).toBe('Safety Observation');
    expect(first.termPolicies).toEqual([
      {
        columnId: 'column-custom-safetyobservation',
        mode: 'CURRENT_PERIOD',
        selectedTerms: undefined,
      },
    ]);
    expect(first.dynamicRowPolicy).toEqual({
      employeeDefaultScope: 'CURRENT_TERM',
      managerDefaultScope: 'CURRENT_TERM',
      allowEmployeeTermChoice: false,
      allowManagerTermChoice: false,
    });
  });

  it('persists a valid layout and predefined custom values without loss', () => {
    const layout = validLayout();
    const version = new PmsTemplateVersion({
      templateId: new Types.ObjectId(),
      versionNo: 1,
      status: PmsTemplateStatus.DRAFT,
      sections: [objectiveSection(layout)],
    });

    expect(version.validateSync()).toBeUndefined();
    const persisted = version.toObject().sections[0].objectiveConfig!;
    expect(persisted.tableLayout).toMatchObject(layout);
    expect(persisted.predefinedObjectives?.[0].columnValues).toEqual({ 'custom.actual': 0 });
    expect(persisted.predefinedObjectives?.[0].rowGroupKey).toBe('predefined');
  });

  it('wires layout normalization into template section saves', () => {
    const service = new PmsTemplateService(context()) as unknown as {
      normalizeSections(sections: unknown[]): ITemplateSection[];
    };
    const rawSection = objectiveSection(validLayout()) as unknown as Record<string, any>;
    delete rawSection.objectiveConfig.tableLayout.layoutVersion;
    delete rawSection.objectiveConfig.tableLayout.dynamicRowPolicy.employeeDefaultScope;

    const normalized = service.normalizeSections([rawSection]);
    const config = normalized[0].objectiveConfig!;

    expect(config.tableLayout?.layoutVersion).toBe(1);
    expect(config.tableLayout?.dynamicRowPolicy.employeeDefaultScope).toBe('CURRENT_TERM');
    expect(config.tableLayout?.columns.map((column) => column.columnId)).toEqual([
      'col-objective',
      'col-actual',
      'col-achievement',
    ]);
    expect(config.predefinedObjectives?.[0].columnValues).toEqual({ 'custom.actual': 0 });
  });

  it('preserves the complete layout through template-version cloning', () => {
    const layout = validLayout();
    const source = new PmsTemplateVersion({
      templateId: new Types.ObjectId(),
      versionNo: 1,
      status: PmsTemplateStatus.ACTIVE,
      sections: [objectiveSection(layout)],
      isLocked: true,
    });
    expect(source.validateSync()).toBeUndefined();

    const cloned = new PmsTemplateVersion({
      templateId: new Types.ObjectId(),
      versionNo: 1,
      status: PmsTemplateStatus.DRAFT,
      sections: source.toObject().sections,
      isLocked: false,
    });

    expect(cloned.validateSync()).toBeUndefined();
    expect(cloned.toObject().sections[0].objectiveConfig?.tableLayout).toEqual(
      source.toObject().sections[0].objectiveConfig?.tableLayout,
    );
  });

  it('accepts a complete activation-ready layout', () => {
    expect(
      objectiveTableLayoutValidationErrors(validLayout(), {
        activationReady: true,
        predefinedObjectives: objectiveSection(validLayout()).objectiveConfig!.predefinedObjectives,
        templateFieldKeys: ['objective_notes'],
        allowEmployeeCreated: true,
        allowManagerCreated: true,
      }),
    ).toEqual([]);
  });

  it('accepts activation-ready flat layouts without dynamic row groups', () => {
    const flat = validLayout();
    flat.rowGroups = [];
    flat.rowAssignments = [];

    expect(
      objectiveTableLayoutValidationErrors(flat, {
        activationReady: true,
        predefinedObjectives: objectiveSection(flat).objectiveConfig!.predefinedObjectives,
        templateFieldKeys: ['objective_notes'],
        allowEmployeeCreated: true,
        allowManagerCreated: true,
      }),
    ).toEqual([]);
  });

  it('requires at least one template row before activation', () => {
    expect(
      objectiveTableLayoutValidationErrors(validLayout(), {
        activationReady: true,
        predefinedObjectives: [],
        templateFieldKeys: ['objective_notes'],
        allowEmployeeCreated: true,
        allowManagerCreated: true,
      }),
    ).toContain('Objective table layout requires at least one template row before activation');
  });

  it('blocks invalid references, editable formulas, and incomplete selected-term mapping', () => {
    const invalid = validLayout();
    invalid.columns[2].access = [
      { role: 'EMPLOYEE', visible: true, editable: true },
    ];
    invalid.columnGroups[0].columnIds.push('missing-column');
    invalid.termPolicies[2] = {
      columnId: 'col-achievement',
      mode: 'SELECTED_PERIODS',
      selectedTerms: [],
    };
    invalid.formulas[0].ast = { type: 'COLUMN', columnId: 'col-achievement' };

    const errors = objectiveTableLayoutValidationErrors(invalid, {
      activationReady: true,
      predefinedObjectives: objectiveSection(invalid).objectiveConfig!.predefinedObjectives,
      templateFieldKeys: ['objective_notes'],
      allowEmployeeCreated: true,
      allowManagerCreated: true,
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        'Objective table layout calculated column "col-achievement" cannot be editable for EMPLOYEE',
        'Objective table layout column group "group-results" references missing column "missing-column"',
        'Objective table layout column "col-achievement" must select at least one assessment term',
        'Objective table layout formula "formula-achievement" cannot reference itself',
      ]),
    );
  });

  it('blocks incompatible formula source types, scopes, and calculated rows', () => {
    const invalid = validLayout();
    invalid.columns[1].type = PmsTemplateFieldType.LONG_TEXT;
    invalid.formulas[0].scope = 'ROW';
    invalid.formulas[0].ast = {
      type: 'FUNCTION',
      name: 'SUM_TERMS',
      arguments: [{ type: 'COLUMN', columnId: 'col-actual' }],
    };
    invalid.calculatedRows = [{
      calculatedRowId: 'table-total',
      label: 'Table total',
      scope: 'TABLE',
      formulaId: 'formula-achievement',
      displayOrder: 1,
    }];

    const errors = objectiveTableLayoutValidationErrors(invalid, {
      activationReady: true,
      predefinedObjectives: objectiveSection(invalid).objectiveConfig!.predefinedObjectives,
      templateFieldKeys: ['objective_notes'],
      allowEmployeeCreated: true,
      allowManagerCreated: true,
    });

    expect(errors).toEqual(expect.arrayContaining([
      'Objective table layout formula "formula-achievement" uses a term function and must have ROW_ACROSS_TERMS scope',
      'Objective table layout formula "formula-achievement" references non-numeric column "col-actual"',
      'Objective table layout calculated row "table-total" scope must match formula "formula-achievement"',
    ]));
  });

  it('preserves stable IDs and exposes layout changes in audit summaries', () => {
    const layout = validLayout();
    const cloned = JSON.parse(JSON.stringify(layout)) as ITemplateObjectiveTableLayout;
    cloned.columns[0].label = 'Renamed Business Goal';

    expect(cloned.columns[0].columnId).toBe(layout.columns[0].columnId);
    expect(objectiveTableLayoutAuditSummary(cloned)).toEqual({
      enabled: true,
      layoutVersion: 1,
      columnIds: ['col-objective', 'col-actual', 'col-achievement'],
      columnGroupIds: ['group-results'],
      rowGroupKeys: ['predefined', 'employee', 'manager'],
      formulaIds: ['formula-achievement'],
      calculatedRowIds: [],
      dynamicRowPolicy: cloned.dynamicRowPolicy,
    });
  });

  it('prevents activation when an enabled layout is incomplete', async () => {
    const service = new PmsTemplateService(context()) as unknown as {
      validateTemplateVersionForActivation(version: Record<string, unknown>): Promise<void>;
    };
    const incomplete = validLayout();
    incomplete.columns = [];
    incomplete.columnGroups = [];
    incomplete.termPolicies = [];
    incomplete.formulas = [];
    const section = objectiveSection(incomplete);

    await expect(
      service.validateTemplateVersionForActivation({
        sections: [section],
        annualScoringConfig: {},
      }),
    ).rejects.toThrow('Objective table layout requires at least one column before activation');
  });
});
