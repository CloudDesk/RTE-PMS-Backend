import { Types } from "mongoose";
import { BaseService } from "./base.service";
import { SalaryAssignment } from "../models/salary-assignments.model";

type HraMonthBreakdown = {
  month: string;
  monthStart: Date;
  monthEnd: Date;
  assignmentId: Types.ObjectId | null;
  salaryStructureId: Types.ObjectId | null;
  monthlyGross: number;
  basicPercentage: number;
  hraPercentage: number;
  basicAmount: number;
  hraAmount: number;
};

export type TaxHraContext = {
  employeeId: string;
  financialYear: string;
  basicPercentage: number;
  hraPercentage: number;
  basicPercentageRatio: number;
  hraPercentageRatio: number;
  calculationMode: "single_structure" | "multi_structure_prorated";
  distinctSalaryStructureIds: string[];
  months: HraMonthBreakdown[];
  warnings: string[];
};

export class TaxSalaryContextService extends BaseService {
  async getHraContext(
    employeeId: string,
    financialYear: string,
  ): Promise<TaxHraContext> {
    if (!Types.ObjectId.isValid(employeeId)) {
      throw new Error("Invalid employeeId");
    }

    const [fyStartYear, fyEndYear] = financialYear.split("-").map(Number);
    if (!fyStartYear || !fyEndYear) {
      throw new Error("Invalid financialYear format");
    }

    const fyStartDate = new Date(Date.UTC(fyStartYear, 3, 1, 0, 0, 0, 0));
    const fyEndDate = new Date(Date.UTC(fyEndYear, 2, 31, 23, 59, 59, 999));

    const assignments = await SalaryAssignment.find({
      employeeId: new Types.ObjectId(employeeId),
      effectiveFrom: { $lte: fyEndDate },
      effectiveTo: { $gte: fyStartDate },
    })
      .populate("salaryStructureId")
      .sort({ effectiveFrom: 1 })
      .lean();

    if (!assignments.length) {
      throw new Error("No salary assignments found for the financial year");
    }

    const warnings: string[] = [];
    const months: HraMonthBreakdown[] = [];
    const distinctSalaryStructureIds = new Set<string>();

    // Build FY month by month so mixed salary structures in the same FY can be
    // normalized into one effective FY percentage.
    //
    // Why month-level?
    // - A user can have multiple salary assignments within the same FY.
    // - Each assignment can point to a different salary structure.
    // - monthlyGross can also differ between assignments.
    //
    // We therefore resolve the applicable assignment for each month and derive:
    //   basicAmount = monthlyGross * basicPercentage
    //   hraAmount   = monthlyGross * hraPercentage
    //
    // Then:
    //   annualBasic     = sum(all monthly basic amounts)
    //   annualActualHra = sum(all monthly hra amounts)
    //   annualGross     = sum(all monthly gross amounts)
    //
    // Effective FY ratios are:
    //   basicPercentageRatio = annualBasic / annualGross
    //   hraPercentageRatio   = annualActualHra / annualGross
    //
    // Example 1: same monthly gross across FY
    // - Apr-Jun  : gross 100000, basic 40%, hra 20%
    // - Jul-Mar  : gross 100000, basic 50%, hra 25%
    // - annualGross = 12 * 100000 = 1200000
    // - annualBasic = (3 * 100000 * 0.40) + (9 * 100000 * 0.50) = 570000
    // - annualHra   = (3 * 100000 * 0.20) + (9 * 100000 * 0.25) = 285000
    // - basicRatio  = 570000 / 1200000 = 0.475
    // - hraRatio    = 285000 / 1200000 = 0.2375
    //
    // Example 2: different monthly gross across FY
    // - Apr-Jun  : gross 100000, basic 40%, hra 20%
    // - Jul-Mar  : gross 200000, basic 50%, hra 25%
    // - annualGross = (3 * 100000) + (9 * 200000) = 2100000
    // - annualBasic = (3 * 100000 * 0.40) + (9 * 200000 * 0.50) = 1020000
    // - annualHra   = (3 * 100000 * 0.20) + (9 * 200000 * 0.25) = 510000
    // - basicRatio  = 1020000 / 2100000 = 0.485714...
    // - hraRatio    =  510000 / 2100000 = 0.242857...
    //
    // This is why we must use gross-weighted annual ratios instead of simply
    // averaging percentages across assignments.
    for (let offset = 0; offset < 12; offset++) {
      const monthStart = new Date(Date.UTC(fyStartYear, 3 + offset, 1, 0, 0, 0, 0));
      const monthEnd = new Date(Date.UTC(fyStartYear, 4 + offset, 0, 23, 59, 59, 999));
      const monthLabel = monthStart.toISOString().slice(0, 7);

      const matchingAssignments = assignments.filter((assignment: any) => {
        return (
          new Date(assignment.effectiveFrom) <= monthEnd &&
          new Date(assignment.effectiveTo) >= monthStart
        );
      });

      if (!matchingAssignments.length) {
        warnings.push(`No salary assignment found for ${monthLabel}.`);
        months.push({
          month: monthLabel,
          monthStart,
          monthEnd,
          assignmentId: null,
          salaryStructureId: null,
          monthlyGross: 0,
          basicPercentage: 0,
          hraPercentage: 0,
          basicAmount: 0,
          hraAmount: 0,
        });
        continue;
      }

      if (matchingAssignments.length > 1) {
        warnings.push(
          `Multiple salary assignments overlap ${monthLabel}; latest effective assignment used.`,
        );
      }

      const chosenAssignment = matchingAssignments.sort((a: any, b: any) => {
        return (
          new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime()
        );
      })[0] as any;

      const structure = chosenAssignment.salaryStructureId as any;
      const structureId = structure?._id ? String(structure._id) : null;
      const basicPercentage = Number(structure?.fixedEarnings?.basicPercentage ?? 0);
      const hraPercentage = Number(structure?.fixedEarnings?.hraPercentage ?? 0);
      const monthlyGross = Number(chosenAssignment.monthlyGross ?? 0);

      if (!structureId) {
        warnings.push(`Salary structure missing for ${monthLabel}.`);
      } else {
        distinctSalaryStructureIds.add(structureId);
      }

      const basicAmount = Math.round((basicPercentage / 100) * monthlyGross);
      const hraAmount = Math.round((hraPercentage / 100) * monthlyGross);

      months.push({
        month: monthLabel,
        monthStart,
        monthEnd,
        assignmentId: chosenAssignment._id ?? null,
        salaryStructureId: structure?._id ?? null,
        monthlyGross,
        basicPercentage,
        hraPercentage,
        basicAmount,
        hraAmount,
      });
    }

    const annualBasic = months.reduce((sum, month) => sum + month.basicAmount, 0);
    const annualActualHra = months.reduce((sum, month) => sum + month.hraAmount, 0);
    const annualGross = months.reduce((sum, month) => sum + month.monthlyGross, 0);

    // Final FY-effective ratios that the FE can safely apply against the
    // already computed taxDeclaration.annualGross:
    //   derivedBasic     = annualGross * basicPercentageRatio
    //   derivedActualHra = annualGross * hraPercentageRatio
    const basicPercentageRatio =
      annualGross > 0 ? annualBasic / annualGross : 0;
    const hraPercentageRatio =
      annualGross > 0 ? annualActualHra / annualGross : 0;

    return {
      employeeId,
      financialYear,
      basicPercentage: Number((basicPercentageRatio * 100).toFixed(4)),
      hraPercentage: Number((hraPercentageRatio * 100).toFixed(4)),
      basicPercentageRatio: Number(basicPercentageRatio.toFixed(6)),
      hraPercentageRatio: Number(hraPercentageRatio.toFixed(6)),
      calculationMode:
        distinctSalaryStructureIds.size <= 1
          ? "single_structure"
          : "multi_structure_prorated",
      distinctSalaryStructureIds: [...distinctSalaryStructureIds],
      months,
      warnings,
    };
  }
}
