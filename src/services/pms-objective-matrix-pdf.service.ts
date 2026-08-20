import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import handlebars from 'handlebars';
import puppeteer, { type Browser } from 'puppeteer';
import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { ObjectiveMatrixService } from './objective-matrix.service';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { AnnualCycle } from '../models/pms-annual-cycle.model';
import { AnnualDecision } from '../models/pms-annual-decision.model';
import { PerformanceHistorySnapshot } from '../models/pms-performance-history-snapshot.model';
import { PmsTemplateVersion } from '../models/pms-template-version.model';
import { PmsTemplate } from '../models/pms-template.model';
import { TermAssignment } from '../models/pms-term-assignment.model';
import { normalizePmsRole, PmsRole } from '../constants/pms.enums';
import { getPuppeteerLaunchOptions, getPuppeteerRuntimeConfig } from '../utilis/puppeteer';
import type { RequestContext } from '../types/context';
import type {
  AnnualObjectiveMatrixResponse,
  ObjectiveMatrixMode,
  ObjectiveMatrixRow,
} from '../types/pms-objective-matrix';
import type {
  ObjectiveMatrixPdfQuery,
  ObjectiveMatrixPdfResult,
  ObjectiveMatrixPdfSnapshotMode,
  ObjectiveMatrixReportColumn,
  ObjectiveMatrixReportColumnBand,
  ObjectiveMatrixReportHeaderGroup,
  ObjectiveMatrixReportViewModel,
} from '../types/pms-objective-matrix-report';

type RecordValue = Record<string, any>;
type FrozenMatrixMap = Partial<Record<ObjectiveMatrixMode, AnnualObjectiveMatrixResponse | null>>;

let sharedBrowser: Browser | null = null;
let sharedBrowserLaunch: Promise<Browser> | null = null;
let activeRenders = 0;
const renderWaiters: Array<() => void> = [];

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function stringValue(value: unknown, fallback = 'N/A'): string {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : fallback;
  if (Array.isArray(value)) {
    if (value.length === 0) return fallback;
    return value.map((item) => stringValue(item, '')).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    const item = value as Record<string, unknown>;
    const reference = item.fileName ?? item.name ?? item.label ?? item.value;
    return reference ? String(reference) : JSON.stringify(value);
  }
  return String(value);
}

function titleCase(value: unknown): string {
  return String(value ?? 'N/A')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function safeFilePart(value: unknown, fallback: string): string {
  const normalized = String(value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function templatePath(): string {
  const candidates = [
    path.join(process.cwd(), 'templates', 'pms-objective-matrix-report.hbs'),
    path.join(__dirname, '..', 'templates', 'pms-objective-matrix-report.hbs'),
    path.join(__dirname, '..', '..', 'templates', 'pms-objective-matrix-report.hbs'),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error('PMS objective matrix PDF template is unavailable');
  return found;
}

async function acquireRenderPermit(): Promise<void> {
  const limit = getPuppeteerRuntimeConfig().maxConcurrentPdfRenders;
  if (activeRenders < limit) {
    activeRenders += 1;
    return;
  }
  await new Promise<void>((resolve) => renderWaiters.push(resolve));
  activeRenders += 1;
}

function releaseRenderPermit(): void {
  activeRenders = Math.max(0, activeRenders - 1);
  renderWaiters.shift()?.();
}

async function browserForRender(): Promise<{ browser: Browser; closeAfter: boolean }> {
  const runtime = getPuppeteerRuntimeConfig();
  if (!runtime.browserReuse) {
    return { browser: await puppeteer.launch(getPuppeteerLaunchOptions()), closeAfter: true };
  }
  if (!sharedBrowser || !sharedBrowser.connected) {
    if (!sharedBrowserLaunch) {
      sharedBrowserLaunch = puppeteer.launch(getPuppeteerLaunchOptions())
        .then((browser) => {
          sharedBrowser = browser;
          browser.on('disconnected', () => {
            if (sharedBrowser === browser) sharedBrowser = null;
          });
          return browser;
        })
        .finally(() => { sharedBrowserLaunch = null; });
    }
    sharedBrowser = await sharedBrowserLaunch;
  }
  return { browser: sharedBrowser, closeAfter: false };
}

export function renderObjectiveMatrixReportHtml(
  viewModel: ObjectiveMatrixReportViewModel,
): string {
  const template = fs.readFileSync(templatePath(), 'utf8');
  return handlebars.compile<ObjectiveMatrixReportViewModel>(template)(viewModel);
}

export async function renderObjectiveMatrixReportPdf(
  viewModel: ObjectiveMatrixReportViewModel,
): Promise<Buffer> {
  await acquireRenderPermit();
  let browser: Browser | null = null;
  let closeAfter = false;
  let page: Awaited<ReturnType<Browser['newPage']>> | null = null;
  try {
    const browserHandle = await browserForRender();
    browser = browserHandle.browser;
    closeAfter = browserHandle.closeAfter;
    page = await browser.newPage();
    const runtime = getPuppeteerRuntimeConfig();
    page.setDefaultTimeout(runtime.defaultTimeoutMs);
    page.setDefaultNavigationTimeout(runtime.navigationTimeoutMs);
    await page.emulateMediaType('print');
    await page.setContent(renderObjectiveMatrixReportHtml(viewModel), { waitUntil: 'load' });
    await page.waitForNetworkIdle({ concurrency: 0 });
    let timeout: NodeJS.Timeout | undefined;
    const pdf = await Promise.race([
      page.pdf({
        format: 'A4',
        landscape: true,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: '<div style="width:100%;padding:0 10mm;font:8px Arial;color:#64748b;text-align:right">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
        margin: { top: '14mm', right: '10mm', bottom: '17mm', left: '10mm' },
      }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Objective matrix PDF generation timed out')),
          runtime.pdfTimeoutMs,
        );
      }),
    ]).finally(() => {
      if (timeout) clearTimeout(timeout);
    });
    return Buffer.from(pdf);
  } finally {
    await page?.close().catch(() => undefined);
    if (closeAfter) await browser?.close().catch(() => undefined);
    releaseRenderPermit();
  }
}

function displayColumns(matrix: AnnualObjectiveMatrixResponse): ObjectiveMatrixReportColumn[] {
  return matrix.columns.flatMap((column) => {
    const policy = matrix.termPolicies.find((item) => item.columnId === column.columnId);
    const groupLabel = matrix.columnGroups.find((group) =>
      group.columnIds.includes(column.columnId),
    )?.label || 'Objective fields';
    const terms = column.type === 'OBJECTIVE_EVIDENCE'
      ? []
      : policy?.mode === 'EVERY_REVIEW_PERIOD'
      ? matrix.termOrder
      : policy?.mode === 'SELECTED_PERIODS'
        ? matrix.termOrder.filter((term) => policy.selectedTerms?.includes(term))
        : policy?.mode === 'CURRENT_PERIOD'
          ? matrix.currentTermCode ? [matrix.currentTermCode] : []
          : [];
    const width = Math.max(90, Math.min(240, Number(column.width) || 160));
    if (terms.length === 0) {
      return [{
        key: column.columnId,
        columnId: column.columnId,
        columnType: column.type,
        label: column.label,
        groupLabel,
        width,
      }];
    }
    return terms.map((term) => ({
      key: `${column.columnId}:${term}`,
      columnId: column.columnId,
      columnType: column.type,
      termCode: term,
      label: terms.length === 1 || column.label.toUpperCase().includes(term)
        ? column.label
        : `${term} ${column.label}`,
      groupLabel,
      width,
    }));
  });
}

export function objectiveEvidenceReportValue(
  row: ObjectiveMatrixRow,
  termOrder: AnnualObjectiveMatrixResponse['termOrder'],
): string {
  const documents = termOrder.flatMap((termCode) => {
    const summary = row.evidenceByTerm?.[termCode];
    return summary?.attachment?.fileName
      ? [`${termCode} — ${summary.attachment.fileName}`]
      : [];
  });
  return documents.length > 0 ? documents.join(' | ') : 'No supporting documents';
}

function splitColumnBands(columns: ObjectiveMatrixReportColumn[]): ObjectiveMatrixReportColumn[][] {
  const maxWidth = 760;
  const bands: ObjectiveMatrixReportColumn[][] = [];
  let current: ObjectiveMatrixReportColumn[] = [];
  let width = 0;
  for (const column of columns) {
    if (current.length > 0 && width + column.width > maxWidth) {
      bands.push(current);
      current = [];
      width = 0;
    }
    current.push(column);
    width += column.width;
  }
  if (current.length > 0) bands.push(current);
  return bands.length > 0 ? bands : [[]];
}

function headerGroups(columns: ObjectiveMatrixReportColumn[]): ObjectiveMatrixReportHeaderGroup[] {
  const groups: ObjectiveMatrixReportHeaderGroup[] = [];
  for (const column of columns) {
    const previous = groups.at(-1);
    if (previous?.label === column.groupLabel) previous.colspan += 1;
    else groups.push({ label: column.groupLabel, colspan: 1 });
  }
  return groups;
}

function cellFor(row: ObjectiveMatrixRow, column: ObjectiveMatrixReportColumn) {
  if (column.termCode) {
    return row.termCells[column.termCode as keyof typeof row.termCells]
      ?.find((cell) => cell.columnId === column.columnId);
  }
  return row.sharedCells.find((cell) => cell.columnId === column.columnId) ??
    Object.values(row.termCells).flatMap((cells) => cells ?? [])
      .find((cell) => cell.columnId === column.columnId);
}

function statusFor(row: ObjectiveMatrixRow, matrix: AnnualObjectiveMatrixResponse): string {
  const sibling = row.siblings.find((item) => item.termCode === matrix.currentTermCode) ??
    row.siblings.at(-1);
  return titleCase(sibling?.status ?? 'NOT_STARTED');
}

function rowGroupFor(row: ObjectiveMatrixRow, matrix: AnnualObjectiveMatrixResponse): string {
  if (row.source !== 'PREDEFINED') {
    const matrixSelection = row.matrixLabel?.trim() || row.matrixCode?.trim();
    if (matrixSelection) return matrixSelection;
  }
  return matrix.rowGroups.find((group) => group.rowGroupKey === row.rowGroupKey)?.label ||
    (row.source === 'PREDEFINED' ? 'Template objectives' :
      row.source === 'MANAGER_CREATED' ? 'Manager objectives' : 'Employee objectives');
}

function buildBands(matrix: AnnualObjectiveMatrixResponse): ObjectiveMatrixReportColumnBand[] {
  const columns = displayColumns(matrix);
  const rawBands = splitColumnBands(columns);
  return rawBands.map((bandColumns, index) => ({
    index: index + 1,
    total: rawBands.length,
    label: rawBands.length === 1
      ? `${bandColumns.length} configured columns`
      : `Column panel ${index + 1} of ${rawBands.length}`,
    columns: bandColumns,
    headerGroups: headerGroups(bandColumns),
    rows: matrix.rows.map((row) => ({
      objectiveRowKey: row.objectiveRowKey,
      objectiveTitle: row.title || 'Objective',
      rowGroup: rowGroupFor(row, matrix),
      source: titleCase(row.source),
      status: statusFor(row, matrix),
      cells: bandColumns.map((column) => {
        if (column.columnType === 'OBJECTIVE_EVIDENCE') {
          return {
            value: objectiveEvidenceReportValue(row, matrix.termOrder),
            calculated: false,
          };
        }
        const cell = cellFor(row, column);
        return {
          value: stringValue(cell?.value),
          calculated: cell?.kind === 'FORMULA',
        };
      }),
    })),
  }));
}

function matrixMapFromSnapshot(finalSnapshot: RecordValue): FrozenMatrixMap {
  const configured = finalSnapshot.objectiveMatricesByView;
  return configured && typeof configured === 'object' ? configured as FrozenMatrixMap : {};
}

function finalDecisionVisible(role: string, visibility: RecordValue): boolean {
  const normalized = normalizePmsRole(role);
  if (
    normalized === PmsRole.ADMIN ||
    normalized === PmsRole.DIRECTOR ||
    normalized === PmsRole.MANAGEMENT
  ) return true;
  const visibleFrom = visibility.visibleFrom ? new Date(visibility.visibleFrom) : null;
  if (visibleFrom && !Number.isNaN(visibleFrom.getTime()) && visibleFrom > new Date()) return false;
  if (normalized === PmsRole.MANAGER) return visibility.managerGradeVisible === true;
  if (normalized === PmsRole.EMPLOYEE) return visibility.employeeGradeVisible === true;
  return false;
}

export function buildObjectiveMatrixReportViewModel(input: {
  matrix: AnnualObjectiveMatrixResponse;
  snapshotMode: ObjectiveMatrixPdfSnapshotMode;
  assignment: RecordValue;
  cycle?: RecordValue | null;
  template?: RecordValue | null;
  templateVersion?: RecordValue | null;
  decision?: RecordValue | null;
  termStates?: Array<{ term: string; state: string }>;
  snapshotId?: string;
  snapshotCreatedAt?: string;
  wasReopened?: boolean;
  visibility?: RecordValue;
  generatedAt?: string;
}): ObjectiveMatrixReportViewModel {
  const { matrix } = input;
  const employee = input.assignment.employeeSnapshot ?? {};
  const manager = input.assignment.managerSnapshot ?? {};
  const visibility = input.visibility ?? input.assignment.visibility ?? {};
  const showOutcome = finalDecisionVisible(matrix.viewRole, visibility);
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const decision = input.decision ?? {};
  const finalDecisionReference = String(decision._id ?? input.snapshotId ?? 'N/A');
  const reportHash = sha256({
    snapshotMode: input.snapshotMode,
    viewRole: matrix.viewRole,
    matrix,
    finalDecisionReference,
    visibleDecision: showOutcome ? {
      finalScore: decision.finalScore,
      finalRating: decision.finalRating,
    } : undefined,
    snapshotId: input.snapshotId,
  });
  const columnsById = new Map(matrix.columns.map((column) => [column.columnId, column]));

  return {
    documentTitle: 'Annual Objective Matrix Report',
    official: input.snapshotMode === 'frozen',
    watermark: input.snapshotMode === 'live' ? 'DRAFT - LIVE DATA' : undefined,
    snapshotModeLabel: input.snapshotMode === 'frozen' ? 'Official frozen record' : 'Draft live preview',
    viewLabel: `${titleCase(matrix.mode)} / ${titleCase(matrix.viewRole)}`,
    employeeName: stringValue(employee.name, 'Employee'),
    employeeCode: stringValue(employee.employeeCode, 'N/A'),
    employeeRole: stringValue(employee.specificRole ?? employee.role, 'N/A'),
    department: stringValue(employee.departmentName ?? employee.departmentId, 'N/A'),
    managerName: stringValue(manager.name, 'N/A'),
    cycleName: stringValue(input.cycle?.name, 'N/A'),
    cycleCode: stringValue(input.cycle?.code, 'N/A'),
    cadence: titleCase(matrix.assessmentTermType),
    termOrder: matrix.termOrder.join(', '),
    templateName: stringValue(input.template?.name, 'N/A'),
    templateVersion: stringValue(input.templateVersion?.versionNo, String(matrix.layoutVersion)),
    annualAssignmentId: matrix.annualAssignmentId,
    finalDecisionReference,
    finalDecisionStatus: titleCase(decision.decisionStatus ?? input.assignment.finalDecisionStatus),
    showFinalDecisionOutcome: showOutcome,
    finalScore: showOutcome ? stringValue(decision.finalScore) : 'N/A',
    finalRating: showOutcome ? stringValue(decision.finalRating) : 'N/A',
    wasReopened: input.wasReopened === true,
    generatedAt,
    snapshotCreatedAt: input.snapshotCreatedAt ?? 'N/A',
    contentHash: reportHash,
    matrixContentHash: matrix.contentHash,
    layoutVersion: matrix.layoutVersion,
    contentVersion: matrix.contentVersion,
    columnBands: buildBands(matrix),
    formulaResults: matrix.formulaResults.map((result) => ({
      label: columnsById.get(result.targetColumnId)?.label ?? 'Calculated field',
      scope: titleCase(result.scope),
      value: stringValue(result.value),
    })),
    calculatedRows: matrix.calculatedRows.map((row) => ({
      label: row.label,
      scope: titleCase(row.scope),
      value: stringValue(row.value),
    })),
    termStates: input.termStates?.length
      ? input.termStates.map((item) => ({ term: item.term, state: titleCase(item.state) }))
      : matrix.termOrder.map((term) => ({
        term,
        state: titleCase(matrix.rows.flatMap((row) => row.siblings)
          .find((sibling) => sibling.termCode === term)?.status ?? 'NOT_STARTED'),
      })),
  };
}

export class PmsObjectiveMatrixPdfService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }

  async generate(
    annualAssignmentId: string,
    query: ObjectiveMatrixPdfQuery = {},
  ): Promise<ObjectiveMatrixPdfResult> {
    if (!Types.ObjectId.isValid(annualAssignmentId)) throw new Error('Invalid annualAssignmentId');
    const snapshotMode: ObjectiveMatrixPdfSnapshotMode = query.snapshot ?? 'live';
    if (!['live', 'frozen'].includes(snapshotMode)) throw new Error(`Unsupported PDF snapshot ${query.snapshot}`);
    const view = query.view ?? this.defaultMode();
    if (!['employee', 'manager', 'reviewer', 'admin'].includes(view)) {
      throw new Error(`Unsupported PDF view ${query.view}`);
    }

    // The matrix service is the authorization boundary and rejects role escalation.
    const authorizedLiveMatrix = await new ObjectiveMatrixService(this.context)
      .getAnnualMatrix(annualAssignmentId, { mode: view });
    const assignment = await AnnualAssignment.findOne({
      _id: new Types.ObjectId(annualAssignmentId),
      isDeleted: false,
    }).lean();
    if (!assignment) throw new Error('Annual assignment not found');

    const snapshots = await PerformanceHistorySnapshot.find({
      annualAssignmentId: assignment._id,
      finalDecisionSnapshot: { $exists: true, $ne: null },
      isDeleted: false,
    }).sort({ createdAt: -1 }).lean();
    const frozenSnapshot = snapshots.find((snapshot) =>
      (snapshot.finalDecisionSnapshot as RecordValue | undefined)?.snapshotKind === 'ANNUAL_DECISION_FREEZE',
    );

    let matrix = authorizedLiveMatrix;
    let sourceAssignment: RecordValue = assignment;
    let cycle: RecordValue | null = null;
    let template: RecordValue | null = null;
    let templateVersion: RecordValue | null = null;
    let decision: RecordValue | null = null;
    let termStates: Array<{ term: string; state: string }> = [];
    let snapshotId: string | undefined;
    let snapshotCreatedAt: string | undefined;

    if (snapshotMode === 'frozen') {
      if (!['FROZEN', 'VISIBILITY_ENABLED'].includes(String(assignment.finalDecisionStatus ?? ''))) {
        throw new Error('Official objective matrix PDF is unavailable until the annual decision is refrozen');
      }
      if (!frozenSnapshot) throw new Error('Frozen objective matrix snapshot was not found');
      const finalSnapshot = frozenSnapshot.finalDecisionSnapshot as RecordValue;
      const frozenMatrices = matrixMapFromSnapshot(finalSnapshot);
      const frozenMatrix = frozenMatrices[view] ??
        (view === 'admin' ? finalSnapshot.objectiveMatrix as AnnualObjectiveMatrixResponse : null);
      if (!frozenMatrix) {
        throw new Error(`Frozen ${view} matrix is unavailable; reopen and refreeze this annual decision`);
      }
      matrix = frozenMatrix;
      if (!/^[a-f0-9]{64}$/.test(matrix.contentHash || '')) {
        throw new Error('Frozen objective matrix content hash is invalid');
      }
      sourceAssignment = (frozenSnapshot.annualSnapshot as RecordValue | undefined) ?? assignment;
      const reportMetadata = finalSnapshot.reportMetadata ?? {};
      cycle = reportMetadata.cycle ?? null;
      template = reportMetadata.template ?? null;
      templateVersion = reportMetadata.templateVersion ?? null;
      decision = finalSnapshot.decision ?? null;
      termStates = this.termStatesFromSnapshot(frozenSnapshot.termSnapshots as RecordValue | undefined);
      snapshotId = frozenSnapshot._id.toString();
      snapshotCreatedAt = new Date(frozenSnapshot.createdAt).toISOString();
    } else {
      const [liveCycle, liveTemplateVersion, liveDecision, terms] = await Promise.all([
        AnnualCycle.findById(assignment.cycleId).lean(),
        assignment.templateVersionId ? PmsTemplateVersion.findById(assignment.templateVersionId).lean() : null,
        AnnualDecision.findOne({ annualAssignmentId: assignment._id, isDeleted: false }).lean(),
        TermAssignment.find({ annualAssignmentId: assignment._id, isDeleted: false })
          .sort({ assessmentTermCode: 1 }).lean(),
      ]);
      cycle = liveCycle;
      templateVersion = liveTemplateVersion;
      template = liveTemplateVersion?.templateId
        ? await PmsTemplate.findById(liveTemplateVersion.templateId).lean()
        : null;
      decision = liveDecision;
      termStates = terms.map((term) => ({
        term: term.assessmentTermCode,
        state: term.termState,
      }));
    }

    if (!cycle) cycle = await AnnualCycle.findById(assignment.cycleId).lean();
    if (!templateVersion && assignment.templateVersionId) {
      templateVersion = await PmsTemplateVersion.findById(assignment.templateVersionId).lean();
    }
    if (!template && templateVersion?.templateId) {
      template = await PmsTemplate.findById(templateVersion.templateId).lean();
    }

    const viewModel = buildObjectiveMatrixReportViewModel({
      matrix,
      snapshotMode,
      assignment: sourceAssignment,
      cycle,
      template,
      templateVersion,
      decision,
      termStates,
      snapshotId,
      snapshotCreatedAt,
      wasReopened: snapshots.some((snapshot) =>
        (snapshot.finalDecisionSnapshot as RecordValue | undefined)?.snapshotKind === 'PRE_REOPEN',
      ),
      visibility: assignment.visibility as RecordValue,
    });
    const buffer = await renderObjectiveMatrixReportPdf(viewModel);
    return {
      buffer,
      fileName: [
        safeFilePart(viewModel.employeeCode, 'employee'),
        safeFilePart(viewModel.cycleCode, 'cycle'),
        'objective-matrix',
        snapshotMode === 'frozen' ? 'official' : 'draft',
        safeFilePart(view, 'view'),
      ].join('_') + '.pdf',
      contentHash: viewModel.contentHash,
      matrixContentHash: viewModel.matrixContentHash,
      snapshotMode,
      snapshotCreatedAt,
    };
  }

  private defaultMode(): ObjectiveMatrixMode {
    const role = normalizePmsRole(this.context.user?.role ?? '');
    if (role === PmsRole.EMPLOYEE) return 'employee';
    if (role === PmsRole.MANAGER) return 'manager';
    if (role === PmsRole.ADMIN) return 'admin';
    return 'reviewer';
  }

  private termStatesFromSnapshot(termSnapshots?: RecordValue): Array<{ term: string; state: string }> {
    if (!termSnapshots) return [];
    return Object.entries(termSnapshots).map(([term, snapshot]) => {
      const value = snapshot as RecordValue;
      const assignment = value.termAssignment ?? value;
      return { term, state: stringValue(assignment.termState, 'NOT_STARTED') };
    });
  }
}
