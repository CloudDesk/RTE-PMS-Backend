# Final Settlement PDF Generation Guide

This guide explains how the **Final Settlement (FNF) PDF** is generated, what prerequisites are required, and how to troubleshoot "No PDF Available" issues.

## 1. The Core Process: How it Works

The system uses a **Word Template (`.docx`)** and dynamically fills it with data, then converts it to PDF.

### Step-by-Step Flow:
1.  **Trigger**: You click "Confirm & Terminate Payout" in the frontend.
2.  **Data Prep**: The backend calculates all final numbers (Unpaid Salary, Notice Recovery, Net Pay).
3.  **Template Loading**: The system looks for the file `Final_Settlement.docx`.
4.  **Injection**: It uses `docxtemplater` to replace tags like `{#deduction}{pf}{/deduction}` with actual values (e.g., `1,200.00`).
5.  **Conversion**: It uses `libreoffice-convert` to transform the filled DOCX into a PDF.
6.  **Upload**: The PDF is uploaded to Google Cloud Storage (GCP).
7.  **Result**: The GCP URL is returned to the frontend and displayed as the "Download Letter" button.

---

## 2. Requirements (Why it might fail)

For this process to work on your local machine (Windows), you **MUST** have the following:

### A. The Template File
*   **Filename**: `Final_Settlement.docx` (Case-sensitive!)
*   **Location**: It must be in either:
    *   `C:\Users\Dell\Documents\GitHub\Vinithcloud\Zuno-hr-India-Api\templates\` (Recommended)
    *   `C:\Users\Dell\Documents\GitHub\Vinithcloud\Zuno-hr-India-Api\` (Root folder)

### B. LibreOffice (Critical!)
*   The code uses `libreoffice-convert`. This requires the **LibreOffice software** to be installed on the machine running the server.
*   **If you do not have LibreOffice installed**, the conversion will fail, and you will see "No PDF Available".
*   **Check**: Open PowerShell and type `soffice --version`. If it says "command not found", you need to install it.

---

## 3. Template Tags (For Reference)

Ensure your `Final_Settlement.docx` uses these exact tags:

| Section | Tag Name | Logic |
| :--- | :--- | :--- |
| **Header** | `{empName}`, `{joiningDate}`, `{leavingDate}` | Basic text replacement. |
| **Earnings** | `{#income}` ... `{/income}` | Group wrapper for earnings. |
| | `{holdSalary}`, `{unpaidBasic}` | Always visible earnings. |
| | `{#reimbursement}Reimb{/}` `{reimbursement}` | Conditional reimbursement row. |
| **Deductions** | `{#deduction}` ... `{/deduction}` | Group wrapper for deductions. |
| | `{#pf}PF{/}` `{pf}` | Conditional PF. |
| | `{#pt}PT{/}` `{pt}` | Conditional Prof Tax. |
| | `{#noticeRecovery}NOTICE{/}` `{noticeRecovery}` | Conditional Notice Penalty. |
| | `{#lopDeduction}LOP{/}` `{lopDeduction}` | Conditional LOP. |

---

## 4. Troubleshooting "No PDF Available"

If you see "No PDF Available" after confirming:

1.  **Check Console Logs**: Look at your backend terminal.
    *   Error: `FNF_Template.docx not found` -> You named the file wrong or put it in the wrong folder.
    *   Error: `Could not find OpenOffice/LibreOffice` -> You need to install LibreOffice.
    *   Error: `GCP Upload failed` -> Your cloud credentials might be invalid.

2.  **Verify File Existence**:
    *   Run this command in terminal to check if the file exists:
        ```powershell
        ls templates/Final_Settlement.docx
        ```

3.  **Local Dev Workaround**:
    *   If you can't install LibreOffice locally, you can temporarily modify `fnf-pdf.helper.ts` to skip the PDF conversion and just return the DOCX file for testing, OR confirm that the feature works but will only generate actual PDFs on the Production Server (where LibreOffice is usually installed).
