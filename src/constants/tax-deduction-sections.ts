/**
 * Tax deduction sections configuration - aligned with FE.
 * Section ids must match the section enum in src/models/tax-declaration.ts.
 */

export interface ISubsection {
  id: string;
  name: string;
  maxLimit?: number | null;
  note?: string;
}

export interface IDeductionSection {
  id: string;
  title: string;
  description: string;
  maxLimit: number | null;
  limitType: "section" | "subsection" | "dynamic" | "both";
  subsections: ISubsection[];
}

/** All section ids allowed in tax declarations (for validation). */
export const TAX_DEDUCTION_SECTION_IDS = [
  "10_13A",
  "80C",
  "80D",
  "80DD",
  "80E",
  "80GG",
  "80CCD2",
  "income_loss_house_property",
] as const;

/** Tax deduction sections - single source of truth for BE; FE can sync from GET /sections. */
export const deductionSections: IDeductionSection[] = [
  {
    id: "10_13A",
    title: "Section 10(13A)",
    description: "House Rent Allowance (HRA) Exemption",
    maxLimit: null,
    limitType: "dynamic",
    subsections: [{ id: "rent_paid", name: "Annual Rent Paid" }],
  },
  {
    id: "80C",
    title: "Section 80C",
    description:
      "Deduction for Investment in Specified Savings Instruments (Includes 80CCC & 80CCD(1))",
    maxLimit: 150000,
    limitType: "section",
    subsections: [
      {
        id: "life_insurance",
        name: "Life Insurance Premium",
        maxLimit: null,
        note: "",
      },
      {
        id: "epf",
        name: "Employee Provident Fund (EPF)",
        maxLimit: null,
        note: "",
      },
      {
        id: "housing_loan_principal",
        name: "Housing Loan Principal",
        maxLimit: null,
        note: "",
      },
      {
        id: "national_savings_certificate",
        name: "National Savings Certificate",
        maxLimit: null,
        note: "",
      },
      {
        id: "80CCC",
        name: "Premium paid for Pension (80CCC)",
        maxLimit: null,
        note: "",
      },
      {
        id: "80CCD1",
        name: "National Pension System (80CCD1)",
        maxLimit: null,
        note: "",
      },
    ],
  },
  {
    id: "80D",
    title: "Section 80D",
    description: "Deduction for Premium Paid on Health Insurance",
    maxLimit: null,
    limitType: "subsection",
    subsections: [
      {
        id: "self_family",
        name: "Health Insurance for self, spouse, children",
        maxLimit: 25000,
        note: "Includes medical check-up up to 5,000",
      },
      {
        id: "medical_checkup_self",
        name: "Preventive Medical Check-up (Self/Family)",
        maxLimit: 5000,
      },
      {
        id: "parents",
        name: "Health Insurance for Parents",
        maxLimit: 50000,
        note: "Senior citizens, includes medical check-up up to 5,000",
      },
      {
        id: "medical_checkup_parents",
        name: "Preventive Medical Check-up (Parents)",
        maxLimit: 5000,
      },
    ],
  },
  {
    id: "80DD",
    title: "Section 80DD",
    description: "Medical Treatment of a Disabled Dependent",
    maxLimit: 125000,
    limitType: "subsection",
    subsections: [
      {
        id: "formal_disability",
        name: "Standard Disability (40% or more)",
        maxLimit: 75000,
      },
      {
        id: "severe_disability",
        name: "Severe Disability (80% or more)",
        maxLimit: 125000,
      },
    ],
  },
  {
    id: "80E",
    title: "Section 80E",
    description: "Interest on Loan for Higher Education",
    limitType: "dynamic",
    maxLimit: null,
    subsections: [{ id: "education_loan", name: "Total Interest Paid" }],
  },
  {
    id: "80GG",
    title: "Section 80GG",
    description: "Deduction for Rent Paid (No HRA received)",
    limitType: "dynamic",
    maxLimit: null,
    subsections: [{ id: "rent_paid", name: "Rent Paid" }],
  },
  {
    id: "80CCD2",
    title: "Section 80CCD(2)",
    description: "Employer's contribution to NPS",
    limitType: "dynamic",
    maxLimit: null,
    subsections: [
      {
        id: "employer_nps",
        name: "Employer's NPS Contribution",
        maxLimit: 0,
      },
    ],
  },
  {
    id: "income_loss_house_property",
    title: "Income/Loss from House Property",
    description: "Interest on Housing Loan (Self-occupied property)",
    maxLimit: 200000,
    limitType: "subsection",
    subsections: [
      {
        id: "house_property_details",
        name: "Net Income/Loss from House Property",
        maxLimit: 200000, // Max deduction limit for Loss. Income has no limit but acts as negative deduction.
        note: "Select 'Loss' for deduction, 'Income' to add to taxable income"
      }
    ],
  },
];
