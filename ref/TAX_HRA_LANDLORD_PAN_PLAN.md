# Plan: Section 10(13A) HRA – Landlord Name, PAN & PAN Document (with Admin Verification)

**Scope:** When user declares HRA (section `10_13A`) **more than ₹1,00,000**, capture landlord name, landlord PAN number, and landlord PAN document. The PAN **file** must go through Document collection so **admin can verify** (e.g. PAN entered as AAAAA0000A but uploaded file is wrong → admin rejects).

**No code changes in this doc – plan only.**

---

## 1. What We Store & Where

| Data | Where | Reason |
|------|--------|--------|
| **Landlord name** | On the **declaration** (TaxDeclaration.declarations[].landlordName) | User/admin view declaration; no approval needed for text. |
| **Landlord PAN number** | On the **declaration** (TaxDeclaration.declarations[].landlordPan) | Same as above; admin compares with file. |
| **Landlord PAN file** | **Document** collection (new type) + **reference** on declaration (landlordPanDocumentId) | Reuse Document approval flow: Pending → Verified / Rejected; admin verifies “file matches PAN”. |

- **Rent receipt** (proof of rent): unchanged → stays in `declaration.documents[]` (embedded refs only).
- **Landlord PAN file**: new → stored as a **Document** record; declaration holds only `landlordPanDocumentId` (ObjectId ref).

---

## 2. Document Collection – New Type for PAN File

- **Type:** e.g. `TaxDeclarationHRAPAN` (add to Document `type` enum).
- **Category:** `Tax`.
- **Metadata (e.g. `metadata.taxDeclarationHraPan`):**
  - `taxDeclarationId`: ObjectId (link to TaxDeclaration).
  - `section`: `"10_13A"`.
  - `subSection`: `"rent_paid"`.
  - `landlordName`: string (copy from declaration for display in doc list).
  - `landlordPan`: string (copy from declaration – admin checks file matches this).
  - **`status`:** `'Pending' | 'Verified' | 'Rejected' | 'ResubmissionRequested'` (same idea as Form12B).
  - **`verificationDetails` (optional):** `{ verifiedBy, verifiedAt, comments }` when admin verifies/rejects.

This gives:
- One Document record per “HRA landlord PAN” upload.
- Admin sees document + metadata (landlord name, PAN) and can set status after checking the file.

---

## 3. TaxDeclaration Model – Declaration-Level Fields

On **declaration** (per item in `declarations[]`), add **optional** fields (only used for section `10_13A`):

- `landlordName`: string (optional).
- `landlordPan`: string (optional).
- `landlordPanDocumentId`: ObjectId, ref `'Document'` (optional).

**Validation (in service):**
- When `section === '10_13A'` and `declaredAmount > 100000`: require `landlordName`, `landlordPan`.
- `landlordPanDocumentId` is required only when user "submits for review" (or at POI submit): i.e. before admin can approve the declaration, PAN file must be uploaded (Document created and linked). So: validate presence of `landlordPanDocumentId` when declaration status moves to submitted/review, not on every save.
- Optional: validate Indian PAN format (10 chars, e.g. `AAAAA9999A`) for `landlordPan`.

---

## 4. Declaration Review vs PAN Document Status (Important)

**Rule (recommended):** When admin reviews declarations (`reviewDeclarations`), for the **10_13A / rent_paid** declaration:
- **Allow "Approve"** only if the linked landlord PAN Document has status **Verified**. If PAN doc is **Pending** or **Rejected**, either:
  - **Option A (strict):** Block approval; show message "Verify landlord PAN document first."
  - **Option B (relaxed):** Allow declaration approval; PAN verification is separate (admin can verify PAN later). Declaration verified amount can still count; PAN doc remains for audit.

**Recommendation:** Option A – so that "declaration verified" implies both rent proof and landlord PAN are verified.

**Implementation note:** In `reviewDeclarations`, before setting 10_13A declaration to `verified`, check `declaration.landlordPanDocumentId`; if present, fetch Document and ensure `metadata.taxDeclarationHraPan.status === 'Verified'`. If not, reject or skip that declaration and return a clear error.

---

## 5. Resubmission / Replace PAN File

- **User uploads PAN for the first time:** Create Document, set declaration.landlordPanDocumentId.
- **User re-uploads PAN** (e.g. wrong file, or after ResubmissionRequested):
  - **Approach:** Create a **new** Document record (new file path, new _id), set declaration.landlordPanDocumentId = new Document._id. Old Document remains in DB (no delete) for audit; optional: mark old one as superseded in metadata if needed.
  - **ResubmissionRequested:** When admin sets PAN doc status to ResubmissionRequested, user uploads again → backend creates new Document with status Pending and links it; declaration.landlordPanDocumentId points to the new doc.

---

## 6. User Flow (High Level)

1. User submits/updates declaration with 10_13A and declared amount > ₹1,00,000 → sends **landlord name** and **landlord PAN** (e.g. in PUT body).
2. User uploads **landlord PAN file** via **new API** POST `/:id/landlord-pan` (multipart). FE can call PUT (step 1) and this API in parallel / async.
3. Backend:
   - Saves file (same storage as today).
   - Creates a **Document** with type `TaxDeclarationHRAPAN`, category `Tax`, file path, and metadata (taxDeclarationId, section, subSection, landlordName, landlordPan, status: `Pending`).
   - Updates the matching declaration: set `landlordName`, `landlordPan`, `landlordPanDocumentId` = new Document._id.
4. Admin:
   - Views document (or declaration; UI can link to Document via `landlordPanDocumentId`).
   - Opens PAN file; checks if it matches declared PAN (e.g. AAAAA0000A).
   - Marks document as **Verified** or **Rejected** (and optionally adds comments) → update Document metadata (status, verificationDetails).
5. User/admin can **view** landlord name and PAN file (and its verification status) from declaration + Document.

---

## 7. API / Flow Outline (No Implementation Detail)

- **Declaration update (PUT):** Accept `landlordName`, `landlordPan` for the 10_13A declaration; validate when amount > 1,00,000.
- **Do not change existing POST `/:id/update-documents`.** Keep it for rent receipt and other proof docs only; do not add landlord PAN handling there.
- **New dedicated API for landlord PAN file – POST `/:id/landlord-pan`:** Detect landlord PAN upload (field name `file` or `landlordPan`). Backend: load TaxDeclaration by `:id`, find 10_13A/rent_paid declaration, create Document, set declaration.landlordPanDocumentId. On re-upload: create new Document and replace ref. FE can call PUT (landlord name/PAN) and this API (PAN file) in parallel / async.
- **Admin verify PAN document:** Reuse or add an existing “verify/reject document” API that updates Document metadata (status, verificationDetails). Same pattern as Form12B verification.
- **GET declaration / GET document:** Response includes landlord name, landlord PAN, and either embedded doc summary or link (landlordPanDocumentId) so FE can show “PAN doc: Pending / Verified / Rejected” and open the file.

---

## 8. GET Declaration Response / Populate (Detail)

- **GET** tax declaration should return each declaration with `landlordName`, `landlordPan`, `landlordPanDocumentId`.
- **Option B (recommended):** For each declaration with `landlordPanDocumentId`, populate or lookup Document and include **summary** in response: `landlordPanDocument: { documentId, filePath, status, verificationDetails? }`. FE shows status and download link in one call.

---

## 9. Edge Cases (Robustness)

| Case | Rule |
|------|------|
| 10_13A declared amount **≤** ₹1,00,000 | Do **not** require landlord name, PAN, or PAN doc. Optional fields can be empty. |
| User changes amount from >1L to ≤1L | Landlord fields can remain; no validation for landlord when amount ≤1L. |
| User removes 10_13A declaration | Declaration item removed. Existing Document(s) remain in DB (audit). |
| One PAN per declaration | At most one 10_13A/rent_paid per TaxDeclaration; at most one landlord PAN Document per TaxDeclaration. |
| PAN upload before declaration save | Allow: create Document with taxDeclarationId + section + subSection; landlordName/landlordPan set on PUT and optionally synced to Document metadata. |
| Financial year | Inferred via taxDeclarationId → TaxDeclaration.financialYear. |

---

## 10. Document Model Changes (Checklist)

- **Type enum:** Add `'TaxDeclarationHRAPAN'` to Document `type` (interface + schema).
- **Metadata:** Add `taxDeclarationHraPan?: { taxDeclarationId, section, subSection, landlordName, landlordPan, status, verificationDetails? }`.
- **Schema validator:** For `type === 'TaxDeclarationHRAPAN'`, require `metadata.taxDeclarationHraPan` with required fields and `status` in enum.
- **Index (optional):** `{ type: 1, 'metadata.taxDeclarationHraPan.taxDeclarationId': 1 }`.

---

## 11. Audit / Audit Log

- When admin verifies/rejects the PAN document, append to Document `auditLog`: `{ action: 'Verify', performedBy, timestamp, details: 'Verified' | 'Rejected' }`. Same pattern as Form12B.

---

## 12. Implementation Checklist (Ordered)

1. **Document model** – Add type `TaxDeclarationHRAPAN`, metadata `taxDeclarationHraPan`, schema validation, optional index.
2. **TaxDeclaration model** – Add to declaration: `landlordName`, `landlordPan`, `landlordPanDocumentId` (ref Document).
3. **Service – update (PUT):** Accept `landlordName`, `landlordPan`; validate when 10_13A and declaredAmount > 100000 (require name + PAN); optional PAN format.
4. **New API – POST `/:id/landlord-pan`:** Multipart with one file. Save file; create Document (type TaxDeclarationHRAPAN); set declaration.landlordPanDocumentId; on re-upload create new Document and replace ref. Do **not** change existing update-documents.
5. **Service – reviewDeclarations:** For 10_13A/rent_paid in approvedList, if landlordPanDocumentId exists, ensure linked Document has status Verified; else block approval.
6. **Document verify API:** Verify/reject PAN document – update metadata status + verificationDetails; append auditLog.
7. **GET declaration:** Include landlordPanDocument summary (documentId, filePath, status, verificationDetails) when landlordPanDocumentId present.
8. **Optional:** On POI submit, validate 10_13A >1L has landlordPanDocumentId.

---

## 13. Summary

- **Landlord name & PAN:** On declaration only (for viewing and for copying into Document metadata).
- **PAN file:** Stored in **Document** with new type and metadata so admin can **verify/reject**; declaration holds only **reference** (`landlordPanDocumentId`).
- **Rent receipt:** Unchanged; stays in `declaration.documents[]`.
- **Approval:** Handled by Document status and verificationDetails. **Declaration approval for 10_13A** should require PAN doc status = Verified (recommended).
- **Robustness:** Validation timing, resubmission/replace, declaration-review rule, GET populate, edge cases, and implementation checklist are covered in sections 4–12.

Once this plan is agreed, implementation can follow the checklist in section 12.
