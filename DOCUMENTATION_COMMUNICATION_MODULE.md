# Documentation: Document & Communication Module

This document outlines the technical flow, architecture, and logic behind the modular Document and Communication system.

## 1. Architectural Overview
The module follows a **decoupled orchestration pattern** to ensure that existing payroll and attendance logic is never affected:

- **Frontend Hub**: A dedicated dashboard at `/admin/communication` (Svelte).
- **Service Orchestrator**: `DocumentService.ts` handles database persistence and email triggers.
- **Generation Engine**: `hike-letter-puppeteer.helper.ts` (Isolated Puppeteer logic).
- **Templates**: Standardized Handlebars (`.hbs`) templates for dynamic PDF rendering.

---

## 2. End-to-End Operational Flows

### A. Hike Letter Flow
1.  **Trigger**: HR selects an employee and enters signatory details via the dashboard.
2.  **Logic Processing**:
    - Fetches the employee’s latest **Salary Assignment** and **Salary Structure**.
    - Passes data to the **Hike Letter Helper**.
    - **Statutory Calculation** (See Section 3) is applied.
3.  **PDF Generation**:
    - Compiles `hikeLetter.hbs` with the calculated data.
    - Puppeteer converts HTML to a professional 2-page PDF.
4.  **Storage**: PDF is uploaded to **GCP Storage** categorized by `employeeId`.
5.  **Dispatch**:
    - Fetches PDF buffer from GCP.
    - **Sends Encrypted Email** to the employee with the PDF attached.
    - Record saved in `Document` collection with status "Sent".

### B. Candidate Offer Flow
1.  **Trigger**: HR uploads a signed PDF and enters a candidate email.
2.  **Process**:
    - File is uploaded to GCP.
    - A tracking document is created (Type: `OfferLetter`).
3.  **Dispatch**: Email is sent to the candidate with the attachment via the safe `EmailService` dispatcher.

### C. Personalized Greetings
1.  **Trigger**: HR chooses a Greeting Type (Birthday/Anniversary) and selects employees.
2.  **Process**:
    - Logic compiles the message into the `generalCommunication.hbs` banner template.
    - Multi-recipient dispatch with personalized field mapping.

---

## 3. Core Logic & Statutory Calculations

### **I. Indian PF Capping (₹1,250 Rule)**
To maintain CTC accuracy, the Hike Letter logic implements the Indian statutory cap:
- **Formula**: `Math.min(Basic * 13%, 1250)`
- **Reasoning**: Standard EPS logic (8.33% of ₹15,000) results in a ₹1,249.50 (approx ₹1,250) cap. For employees with Basic > ₹15,000, the "Company Contribution of PF" in the letter is dynamically capped at ₹1,250 to ensure the overall CTC matches the salary revision policy.

### **II. Indian Currency Words**
The utility `currency.ts` implements a recursive converter for professional total amount words:
- **Scales**: Supports Thousand, Lakh, and Crore.
- **Suffix**: Automatically appends "Rupees Only" and capitalizes the first letter for professional document standards.

### **III. Pro-rata Logic (Annexure)**
- **Monthly Basic**: `MonthlyGross * BasicPercentage` (e.g., 50%).
- **HRA**: `MonthlyGross * HRAPercentage`.
### **IV. Formatting & Visual Precision**
- **Ordinal Dates**: Implemented custom date formatting to provide a professional "Increment Letter" look (e.g., *Aug 2nd, 2024*) instead of standard digital formats.
- **Annexure Labels**: The salary breakup follows a strictly labeled hierarchy (A, B, C, D...) ensuring that the Monthly Fixed Subtotal and CTC are clearly demarcated as per HR compliance standards.

---

## 4. Safety & Regression Protection
- **Additive Only**: All routes and services were appended. No existing `fastify.post` or `BaseService` methods were modified.
- **Email Path Fallback**: The `EmailService` contains a logic layer that searches `uploads/`, `../uploads/`, and absolute paths in sequence. This ensures that **legacy attachments** for existing features (WFH, Leaves) never fail.

---
**Status**: Fully Implemented & Verified.
