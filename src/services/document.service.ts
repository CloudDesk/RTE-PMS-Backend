// import { Types } from "mongoose";
// import * as fs from "fs"; // for sync and callback-based operations
// import * as fsPromises from "fs/promises"; // for async/await operations
// import path from 'path';
// import ExcelJS from 'exceljs';
// import { FastifyReply, FastifyRequest } from "fastify";
// import { RequestContext } from "../types/context";
// import { BaseService } from "./base.service";
// import { ITimesheet, IUser, Payroll, Timesheet, User, Payslip } from "../models";
// import PizZip from "pizzip";
// import Docxtemplater from "docxtemplater";
// import libreoffice from 'libreoffice-convert';
// import { promisify } from 'util';
// import { Document, IDocument } from "../models/document.model";
// import { emailService } from "./email.service";
// import { SalaryAssignment, SalaryStructure } from "../models";
// import { config } from "../config";

// import { TaxDeclaration } from "../models/tax-declaration";
// import { TaxDeclarationService } from "./tax-declaration.service";
// import { getCurrentFinancialYear, formatDateToDDMMYYYY } from "../utilis/dates";
// import { uploadFileToGCP, deleteFileFromGCP } from "../utilis/gcpStorage";
// import { formatCurrency } from "../utilis/currency";
// // import AdmZip from 'adm-zip';
// // import { mkdirSync } from 'fs';

// const monthNames = [
//     'January', 'February', 'March', 'April', 'May', 'June',
//     'July', 'August', 'September', 'October', 'November', 'December'
// ];
// interface ISendPayslipsRequest {
//     month: number;
//     year: number;
//     recipients: string[];
// }
// interface IPayslipGenerationResult {
//     userId: string;
//     status: string;
//     documentId?: string;
//     pdfPath?: string;
//     error?: string;
// }
// interface IPayslipResponse {
//     payslipId: string;
//     employeeId: string;
//     employeeName: string;
//     email: string;
//     month: number;
//     year: number;
//     basic: number;
//     hra: number;
//     da: number;
//     otherAllowance: number;
//     monthYear: string;
//     epfEmployee: number;
//     professionalTax: number;
//     incomeTax: number;
//     overtimePay: number;
//     grossSalary: number;
//     netSalary: number;
//     ctc: number;
//     totalDeductions: number;
//     reimbursement: number;
//     bonus: number;
//     payslipUrl: string;
// }
// interface IBulkGenerationResult {
//     success: boolean;
//     payslips: IPayslipGenerationResult[];
//     summary: {
//         total: number;
//         generated: number;
//         failed: number;
//         updated: number;
//     };
// }
// interface IdentityDocumentResult {
//     panNumber?: string;
//     pfNumber?: string;
//     pfUan?: string;
// }

// // Promisify the libreoffice convert method
// const convertToPdf = promisify(libreoffice.convert);

// export class DocumentService extends BaseService {
//     protected context: RequestContext;

//     constructor(context: RequestContext) {
//         super(context);
//         this.context = context;
//     }

//     async createCertificate(employeeId: string, documentData: any, uploadedFile: any): Promise<IDocument> {
//         // const { type, category, accessLevel, metadata } = documentData;
//         const { type, category, metadata } = documentData;
//         console.log(type, "type createCertificate")
//         console.log(category, "category createCertificate")
//         if (type !== 'Certificate' || category !== 'Certification') {
//             throw new Error('Invalid document type or category for creating a certificate.');
//         }

//         const certificateType = metadata?.certificate?.certificateType;
//         const certificateTitle = metadata?.certificate?.title;
//         console.log(certificateType, "certificateType")
//         console.log(certificateTitle, "certificateTitle")
//         if (!certificateType || !certificateTitle) {
//             throw new Error('Certificate metadata must include certificateType and title.');
//         }

//         // NOTE: No restrictions on certificate types - employees can upload:
//         // - Academic certificates
//         // - Experience certificates  
//         // - IdentityProof certificates (Government IDs: PAN, Aadhaar, Passport, etc.)
//         // All certificate types are allowed for all users

//         // --- Best Practice: Set verification status on the backend ---
//         if (metadata.certificate) {
//             // Handle optional issuingAuthority - remove if empty
//             if (metadata.certificate.issuingAuthority === '' || metadata.certificate.issuingAuthority === null || metadata.certificate.issuingAuthority === undefined) {
//                 delete metadata.certificate.issuingAuthority;
//             }

//             // Handle optional certificateId - remove if empty
//             if (metadata.certificate.certificateId === '' || metadata.certificate.certificateId === null || metadata.certificate.certificateId === undefined) {
//                 delete metadata.certificate.certificateId;
//             }

//             // Convert string dates to Date objects if provided as strings
//             if (metadata.certificate.issueDate) {
//                 if (typeof metadata.certificate.issueDate === 'string' && metadata.certificate.issueDate.trim() !== '') {
//                     metadata.certificate.issueDate = new Date(metadata.certificate.issueDate);
//                 } else if (metadata.certificate.issueDate === '' || metadata.certificate.issueDate === null) {
//                     // Remove empty or null issueDate
//                     delete metadata.certificate.issueDate;
//                 }
//             }
//             if (metadata.certificate.expiryDate) {
//                 if (typeof metadata.certificate.expiryDate === 'string' && metadata.certificate.expiryDate.trim() !== '') {
//                     metadata.certificate.expiryDate = new Date(metadata.certificate.expiryDate);
//                 } else if (metadata.certificate.expiryDate === '' || metadata.certificate.expiryDate === null) {
//                     // Remove empty or null expiryDate
//                     delete metadata.certificate.expiryDate;
//                 }
//             }

//             metadata.certificate.verificationStatus = 'Pending';
//             // Ensure no verification details can be injected on upload
//             delete metadata.certificate.verificationDetails;
//         }

//         // 1. Generate a standardized filename
//         const user = await User.findById(employeeId).lean();
//         if (!user) {
//             throw new Error(`User with ID ${employeeId} not found.`);
//         }
//         console.log(user, "User")
//         const cleanUserName = user.name.replace(/[^a-zA-Z0-9]/g, '_');
//         const cleanTitle = certificateTitle.replace(/[^a-zA-Z0-9]/g, '_');
//         const originalExtension = path.extname(uploadedFile.originalname);
//         const newFileName = `Doc_Certificate_${certificateType}_${cleanUserName}_${cleanTitle}_${originalExtension}`;

//         // 2. Upload file to GCP Cloud Storage
//         const gcpResult = await uploadFileToGCP({
//             filePath: uploadedFile.path,
//             fileName: newFileName,
//             employeeId: employeeId,
//             category: category,
//             type: type
//         });

//         if (!gcpResult.success) {
//             throw new Error(`Failed to upload file to GCP: ${gcpResult.error}`);
//         }

//         const fileUrl = gcpResult.fileUrl!;
//         console.log(gcpResult, "gcpResult");
//         console.log("step3 done - File uploaded to GCP")
//         // 4. Construct the document record for the database
//         const newDocument = new Document({
//             employeeId: new Types.ObjectId(employeeId),
//             type,
//             tags: [`Certificate`, certificateType],
//             category,
//             fileName: newFileName,
//             filePath: fileUrl,
//             accessLevel: 'Public',
//             metadata,
//             status: 'Uploaded',
//             uploadedBy: new Types.ObjectId(this.context.user?._id || employeeId),
//             auditLog: [
//                 {
//                     action: 'Upload',
//                     performedBy: new Types.ObjectId(this.context.user?._id || employeeId),
//                     timestamp: new Date(),
//                     details: `Certificate of type '${certificateType}' uploaded by user.`,
//                 },
//             ],
//         });
//         console.log(newDocument, "before save")
//         await newDocument.save();
//         return newDocument;
//     }

//     async updateCertificate(id: string, documentData: any, uploadedFile: any, req: FastifyRequest): Promise<IDocument> {

//         console.log(id, "id updateCertificate");
//         console.log(documentData, "documentData updateCertificate");
//         console.log(uploadedFile, "uploadedFile updateCertificate");
//         console.log("**")
//         try {
//             // Validate ObjectId format
//             if (!Types.ObjectId.isValid(id)) {
//                 throw new Error('Invalid document ID');
//             }

//             // Find the existing document
//             const existingDocument = await Document.findOne({ _id: new Types.ObjectId(id) });
//             console.log(existingDocument, "existingDocument")
//             if (!existingDocument) {
//                 throw new Error('Document not found');
//             }

//             // Validate document type and category
//             const { type, category, metadata, accessLevel, status, tags } = documentData;
//             if (type && type !== 'Certificate') {
//                 throw new Error('Document type must be Certificate');
//             }
//             if (category && category !== 'Certification') {
//                 throw new Error('Document category must be Certification');
//             }

//             // Validate certificate metadata if provided
//             if (metadata?.certificate) {
//                 const { certificateType, title } = metadata.certificate;
//                 if (!certificateType || !title) {
//                     throw new Error('Certificate metadata must include certificateType and title');
//                 }

//                 // Handle optional issuingAuthority - remove if empty
//                 if (metadata.certificate.issuingAuthority === '' || metadata.certificate.issuingAuthority === null || metadata.certificate.issuingAuthority === undefined) {
//                     delete metadata.certificate.issuingAuthority;
//                 }

//                 // Handle optional certificateId - remove if empty
//                 if (metadata.certificate.certificateId === '' || metadata.certificate.certificateId === null || metadata.certificate.certificateId === undefined) {
//                     delete metadata.certificate.certificateId;
//                 }

//                 // Convert string dates to Date objects if provided as strings
//                 if (metadata.certificate.issueDate) {
//                     if (typeof metadata.certificate.issueDate === 'string' && metadata.certificate.issueDate.trim() !== '') {
//                         metadata.certificate.issueDate = new Date(metadata.certificate.issueDate);
//                     } else if (metadata.certificate.issueDate === '' || metadata.certificate.issueDate === null) {
//                         // Remove empty or null issueDate
//                         delete metadata.certificate.issueDate;
//                     }
//                 }
//                 if (metadata.certificate.expiryDate) {
//                     if (typeof metadata.certificate.expiryDate === 'string' && metadata.certificate.expiryDate.trim() !== '') {
//                         metadata.certificate.expiryDate = new Date(metadata.certificate.expiryDate);
//                     } else if (metadata.certificate.expiryDate === '' || metadata.certificate.expiryDate === null) {
//                         // Remove empty or null expiryDate
//                         delete metadata.certificate.expiryDate;
//                     }
//                 }

//                 // Ensure verification status is not modified by client
//                 metadata.certificate.verificationStatus = existingDocument.metadata?.certificate?.verificationStatus || 'Pending';
//                 delete metadata.certificate.verificationDetails;
//             }

//             // Initialize update data
//             const updateData: any = {
//                 metadata: metadata || existingDocument.metadata,
//                 accessLevel: accessLevel || existingDocument.accessLevel,
//                 status: status || existingDocument.status,
//                 tags: tags || existingDocument.tags,
//                 version: existingDocument.version + 1,
//                 updatedAt: new Date(),
//                 auditLog: [
//                     ...(existingDocument?.auditLog || []),
//                     {
//                         action: 'Update',
//                         performedBy: new Types.ObjectId(req.user?._id || existingDocument.uploadedBy),
//                         timestamp: new Date(),
//                         details: `Certificate updated by user${uploadedFile ? ' with new file' : ''}.`,
//                     },
//                 ],
//             };
//             console.log(updateData, "updateData");

//             // Handle file update
//             let newFileName = existingDocument.fileName;
//             let newFilePath = existingDocument.filePath;

//             if (uploadedFile) {
//                 const user = await User.findById(existingDocument.employeeId).lean();
//                 if (!user) {
//                     throw new Error(`User with ID ${existingDocument.employeeId} not found`);
//                 }

//                 const cleanUserName = user.name.replace(/[^a-zA-Z0-9]/g, '_');
//                 const cleanTitle = (metadata?.certificate?.title || existingDocument.metadata?.certificate?.title || 'certificate').replace(/[^a-zA-Z0-9]/g, '_');
//                 const originalExtension = path.extname(uploadedFile?.filename);
//                 newFileName = `Doc_Certificate_${metadata?.certificate?.certificateType || existingDocument.metadata?.certificate?.certificateType}_${cleanUserName}_${cleanTitle}_${originalExtension}`;

//                 // 1. Upload new file to GCP Cloud Storage
//                 const gcpResult = await uploadFileToGCP({
//                     filePath: uploadedFile.path,
//                     fileName: newFileName,
//                     employeeId: existingDocument.employeeId.toString(),
//                     category: category,
//                     type: type
//                 });

//                 if (!gcpResult.success) {
//                     throw new Error(`Failed to upload file to GCP: ${gcpResult.error}`);
//                 }

//                 // 2. Delete old file from GCP (if different)
//                 if (existingDocument.fileName && existingDocument.fileName !== newFileName && existingDocument.filePath) {
//                     try {
//                         await deleteFileFromGCP(existingDocument.filePath);
//                     } catch (err: any) {
//                         req.log.warn({ filePath: existingDocument.filePath, error: err.message }, 'Failed to delete old file from GCP');
//                     }
//                 }

//                 // 3. Update file path for document
//                 newFilePath = gcpResult.fileUrl!;

//                 updateData.fileName = newFileName;
//                 updateData.filePath = newFilePath;
//             }
//             console.log(updateData, "updateData before upsert");
//             console.log("***")
//             // Update the document
//             /*   const updatedDocument = await Document.findOneAndUpdate(
//                    { _id: new Types.ObjectId(id) },
//                    { $set: updateData },
//                    { new: true, runValidators: true }
//                )
//                    .populate('employeeId', 'name email')
//                    .populate('uploadedBy', 'name email')
//                    .lean();
//                    */
//             existingDocument.set(updateData);
//             const savedDocument = await existingDocument.save();
//             const updatedDocument = await savedDocument
//                 .populate('employeeId', 'name email')
//             if (!updatedDocument) {
//                 throw new Error('Failed to update document');
//             }
//             console.log(updatedDocument, "updatedDocument after upsert")
//             req.log.info({ documentId: id, userId: req.user?._id }, 'Certificate updated successfully');

//             return updatedDocument;

//         } catch (error: any) {
//             req.log.error({ error: error.message, stack: error.stack, documentId: id }, 'Error in updateCertificate service');
//             throw error;
//         }
//     }

//     async verifyDocument(documentId: string, status: 'Verified' | 'Rejected', comments: string, adminId: string): Promise<IDocument> {
//         const document = await Document.findById(documentId);

//         if (!document) {
//             throw new Error(`Document with ID ${documentId} not found.`);
//         }

//         if (document.type !== 'Certificate') {
//             throw new Error('Verification is only applicable to documents of type "Certificate".');
//         }

//         // Update verification status and details
//         if (!document.metadata?.certificate) {
//             throw new Error('Document metadata or certificate information is missing.');
//         }

//         document.metadata.certificate.verificationStatus = status;
//         document.metadata.certificate.verificationDetails = {
//             verifiedBy: new Types.ObjectId(adminId),
//             verifiedAt: new Date(),
//             comments: comments || (status === 'Verified' ? 'Document verified by admin.' : 'Document rejected by admin.'),
//         };

//         /*This is a classic issue when working with Schema.Types.Mixed in Mongoose combined with subdocument mutation. */
//         // Mark metadata modified so Mongoose will persist changes
//         document.markModified('metadata');

//         // Add to audit log
//         document.auditLog = document.auditLog || [];
//         document.auditLog.push({
//             action: 'Verify',
//             performedBy: new Types.ObjectId(adminId),
//             timestamp: new Date(),
//             details: `Document status updated to ${status}.`,
//         });
//         console.log(document, "document verify before save")
//         try {
//             await document.save({ validateModifiedOnly: true }); // Validate only modified fields
//             console.log('Document saved successfully:', document.toObject());
//         } catch (error) {
//             console.error('Save error:', error);
//             throw new Error(`Failed to save document: ${error instanceof Error ? error.message : String(error)}`);
//         }
//         return document
//             .populate('employeeId', 'name email')
//     }

//     async deleteDocument(documentId: string, userId: string, userRole: string): Promise<{ message: string; document?: IDocument }> {
//         // Validate document ID
//         if (!Types.ObjectId.isValid(documentId)) {
//             throw new Error('Invalid document ID');
//         }
//         if (!Types.ObjectId.isValid(userId)) {
//             throw new Error('Invalid User ID');
//         }
//         // Find the document
//         const document = await Document.findById(documentId);

//         if (!document) {
//             throw new Error(`Document with ID ${documentId} not found.`);
//         }

//         // Validate category
//         const isCertification = document.category === 'Certification';
//         const isTaxForm12B = document.category === 'Tax' && document.type === 'Form12B';
//         const isPayrollPayslip = document.category === 'Payroll' && document.type === 'Payslip';
//         const isSettlement = document.category === 'Settlement';
//         const isAdminUpload = document.type === 'AdminUpload';

//         if (!(isCertification || isTaxForm12B || isPayrollPayslip || isAdminUpload || isSettlement)) {
//             throw new Error('Only documents under category "Certification", "Tax" (Form12B), "Payroll" (Payslip), "AdminUpload", or "Settlement" can be deleted.');
//         }

//         if (isCertification) {
//             // Check certificateType and role
//             const isSkillType = document.metadata?.certificate?.certificateType === 'Skill';
//             if (!isSkillType && userRole.toLowerCase() !== 'admin') {
//                 throw new Error('Forbidden: Only admins can delete non-Skill certification documents.');
//             }
//         } else if (isPayrollPayslip || isAdminUpload) {
//             // Only admins can delete payslips or admin uploads
//             if (userRole.toLowerCase() !== 'admin') {
//                 throw new Error('Forbidden: Only admins can delete payslips or admin uploads.');
//             }
//         }
//         // Log document state before deletion
//         console.log('Document before deletion:', document.toObject());

//         // Handle file deletion from GCP
//         if (document.filePath) {
//             try {
//                 await deleteFileFromGCP(document.filePath);
//                 console.log(`Deleted file from GCP: ${document.filePath}`);
//             } catch (err: any) {
//                 console.warn({ filePath: document.filePath, error: err.message }, 'Failed to delete associated file from GCP');
//             }
//         }

//         // Delete the document
//         const deletedDocument = await Document.findByIdAndDelete(documentId).lean();

//         if (!deletedDocument) {
//             throw new Error('Failed to delete document');
//         }

//         // If it was a payslip, also delete the corresponding record from the Payslip collection (legacy support)
//         if (isPayrollPayslip) {
//             try {
//                 const month = deletedDocument.metadata?.payslip?.month;
//                 const year = deletedDocument.metadata?.payslip?.year;
//                 const employeeId = deletedDocument.employeeId;

//                 if (month && year && employeeId) {
//                     await Payslip.deleteMany({
//                         userId: employeeId,
//                         month: month,
//                         year: year
//                     });
//                     console.log(`Deleted corresponding Payslip records for user ${employeeId}, period ${month}-${year}`);
//                 }
//             } catch (err) {
//                 console.warn('Failed to delete corresponding Payslip record:', err);
//                 // We don't throw here as the main document and file are already gone
//             }
//         }

//         return { message: 'Document deleted successfully', document: deletedDocument };
//     }


//     //Get Documents
//     async getDocuments(req: FastifyRequest<{ Querystring: IDocumentQuery }>, reply: FastifyReply): Promise<any> {

//         const user = req.user;

//         const {
//             access = 'own',
//             employeeId,
//             type,
//             category,
//             year,
//             month,
//             financialYear,
//             page = 1,
//             limit = 10,
//             // Employee filters
//             department,
//             role,
//             activeStatus,
//             search,
//             designation,
//             location
//         } = req.query;

//         // Parse year and month to numbers if provided
//         const yearNum = year !== undefined ? (typeof year === 'string' ? parseInt(year, 10) : Number(year)) : undefined;
//         const monthNum = month !== undefined ? (typeof month === 'string' ? parseInt(month, 10) : Number(month)) : undefined;


//         // Input validation
//         if (!user || !user._id) {
//             return reply.status(401).send({
//                 success: false,
//                 error: 'Authentication required'
//             });
//         }

//         const query: any = {};
//         const skip = (page - 1) * limit;

//         try {
//             // Role-based access control with improved scope names
//             if (access === 'own') {
//                 // Any role can access their own documents
//                 // If employeeId is provided in query, validate it matches the logged-in user
//                 if (employeeId) {
//                     // If admin provides employeeId, allow them to query that employee (switch to global behavior)
//                     if (user.role.toLowerCase() === 'admin') {
//                         // Admin can query any employee even with access='own'
//                         const employeeExists = await User.findById(employeeId).lean();
//                         if (!employeeExists) {
//                             return reply.status(404).send({
//                                 success: false,
//                                 error: 'Employee not found'
//                             });
//                         }
//                         query.employeeId = new Types.ObjectId(employeeId);
//                         req.log.info({ userId: user._id, targetEmployeeId: employeeId, access }, 'Admin fetching documents for specific employee with access=own');
//                     } else {
//                         // Non-admin: employeeId must match logged-in user
//                         if (employeeId !== user._id.toString()) {
//                             return reply.status(403).send({
//                                 success: false,
//                                 error: 'Unauthorized: You can only access your own documents'
//                             });
//                         }
//                         query.employeeId = new Types.ObjectId(employeeId);
//                         req.log.info({ userId: user._id, access }, 'Fetching own documents with explicit employeeId');
//                     }
//                 } else {
//                     // No employeeId provided, use logged-in user's ID
//                     query.employeeId = new Types.ObjectId(user._id.toString());
//                     req.log.info({ userId: user._id, access }, 'Fetching own documents');
//                 }
//             }
//             else if (access === 'team') {
//                 // Only managers can access team documents
//                 const allowedRoles = ['manager', 'admin'];
//                 if (!allowedRoles.includes(user.role.toLowerCase())) {
//                     return reply.status(403).send({
//                         success: false,
//                         error: 'Unauthorized: Only managers can access team documents'
//                     });
//                 }
//                 const employeeFilter: any = { managerId: new Types.ObjectId(user._id.toString()) };

//                 // Apply employee filters for team access
//                 if (activeStatus !== undefined) employeeFilter.active = activeStatus;
//                 if (department) employeeFilter.departmentId = department;
//                 if (role) employeeFilter.role = role.toLowerCase();
//                 if (designation) employeeFilter.designation = new RegExp(designation, 'i');
//                 if (location) employeeFilter.location = new RegExp(location, 'i');
//                 if (search) {
//                     employeeFilter.$or = [
//                         { name: new RegExp(search, 'i') },
//                         { email: new RegExp(search, 'i') }
//                     ];
//                 }

//                 console.log(employeeFilter, "employeeFilters")
//                 // Get filtered subordinates
//                 const subordinates = await User.find(employeeFilter, '_id').lean();
//                 const subordinateIds = subordinates.map(u => u._id.toString());

//                 if (subordinateIds.length === 0) {
//                     req.log.info({ managerId: user._id }, 'Manager has no subordinates');
//                     return {
//                         data: [],
//                         meta: { page, limit, total: 0, totalPages: 0 }
//                     };
//                 }

//                 if (employeeId) {
//                     // Specific subordinate requested - validate against filtered list
//                     if (!subordinateIds.includes(employeeId)) {
//                         return reply.status(403).send({
//                             success: false,
//                             error: 'Unauthorized: Employee is not your subordinate or does not match filters'
//                         });
//                     }
//                     query.employeeId = new Types.ObjectId(employeeId);
//                 } else {
//                     // All subordinates
//                     query.employeeId = {
//                         $in: subordinateIds.map(id => new Types.ObjectId(id))
//                     };
//                 }

//                 req.log.info({
//                     managerId: user._id,
//                     subordinatesCount: subordinateIds.length,
//                     targetEmployee: employeeId,
//                     appliedFilters: { department, role, activeStatus, designation, location, search }
//                 }, 'Fetching filtered team documents');
//             }
//             else if (access === 'global') {
//                 console.log("access Global employeeFilters", req.query
//                 )
//                 // Only admins can access all documents
//                 if (user.role.toLowerCase() !== 'admin') {
//                     return reply.status(403).send({
//                         success: false,
//                         error: 'Unauthorized: Only admins can access global documents'
//                     });
//                 }

//                 if (employeeId) {
//                     console.log("in employeeId")
//                     // Specific employee requested - verify employee exists
//                     const employeeExists = await User.findById(employeeId).lean();
//                     if (!employeeExists) {
//                         return reply.status(404).send({
//                             success: false,
//                             error: 'Employee not found'
//                         });
//                     }
//                     query.employeeId = new Types.ObjectId(employeeId);
//                 } else if (department || role !== undefined || activeStatus !== undefined ||
//                     designation || location || search) {
//                     console.log("inside query filter")
//                     // Filter employees based on provided criteria
//                     const employeeFilter: any = {};

//                     if (activeStatus !== undefined) employeeFilter.active = activeStatus;
//                     if (department) employeeFilter.departmentId = department;
//                     if (role) employeeFilter.role = role.toLowerCase();
//                     if (designation) employeeFilter.designation = new RegExp(designation, 'i');
//                     if (location) employeeFilter.location = new RegExp(location, 'i');
//                     if (search) {
//                         employeeFilter.$or = [
//                             { name: new RegExp(search, 'i') },
//                             { email: new RegExp(search, 'i') }
//                         ];
//                     }
//                     console.log(employeeFilter, "employeeFilters")
//                     // Get filtered employees
//                     const filteredEmployees = await User.find(employeeFilter, '_id').lean();
//                     const employeeIds = filteredEmployees.map(emp => emp._id);

//                     // If demographic filters were applied (department, location, etc.) and no employees found, return empty
//                     const hasDemographicFilters = department || role !== undefined || activeStatus !== undefined || designation || location;
//                     if (employeeIds.length === 0 && hasDemographicFilters) {
//                         req.log.info({ adminId: user._id, filters: req.query }, 'No employees match demographic filters');
//                         return {
//                             data: [],
//                             meta: { page, limit, total: 0, totalPages: 0 }
//                         };
//                     }

//                     // Build final document query conditions
//                     if (search) {
//                         const searchRegex = new RegExp(search, 'i');
//                         const orConditions: any[] = [
//                             { type: searchRegex },
//                             { fileName: searchRegex },
//                             { "metadata.offerLetter.candidateName": searchRegex },
//                             { "metadata.offerLetter.candidateEmail": searchRegex },
//                             { "metadata.offerLetter.designation": searchRegex },
//                             { "metadata.hikeLetter.employeeName": searchRegex },
//                             { "metadata.hikeLetter.employeeCode": searchRegex },
//                             { "metadata.hikeLetter.employeeEmail": searchRegex },
//                             { "metadata.hikeLetter.employeeDesignation": searchRegex },
//                             { "metadata.hikeLetter.batchName": searchRegex },
//                             { "metadata.name": searchRegex },
//                             { "metadata.email": searchRegex }
//                         ];

//                         // If we found employees matching the name/email search, include them
//                         if (employeeIds.length > 0) {
//                             orConditions.push({ employeeId: { $in: employeeIds } });
//                         }

//                         query.$or = orConditions;
//                     } else if (employeeIds.length > 0) {
//                         if (type !== 'AttendanceFile') {
//                             query.employeeId = { $in: employeeIds };
//                         }
//                     }

//                     req.log.info({
//                         adminId: user._id,
//                         filteredEmployeesCount: employeeIds.length,
//                         hasSearch: !!search,
//                         appliedFilters: { department, role, activeStatus, designation, location }
//                     }, 'Fetching documents with enhanced search');
//                 }

//                 req.log.info({
//                     adminId: user._id,
//                     targetEmployee: employeeId
//                 }, 'Fetching global documents');
//             }
//             else {
//                 return reply.status(400).send({
//                     success: false,
//                     error: 'Invalid access level. Must be: own, team, or global'
//                 });
//             }
//             // Apply type filter if provided
//             if (type) {
//                 query.type = type;
//             }

//             if (category) {
//                 query.category = category;

//                 // Restriction for Payroll: Only show exported payslips for employees (access='own')
//                 if (category === 'Payroll' && access === 'own') {
//                     query['metadata.payslip.isExport'] = true;
//                 }

//                 // Dynamic query enhancement for category 'Tax'
//                 // Dynamic query enhancement for category 'Tax'
//                 if (category === 'Tax' && (user.role.toLowerCase() !== 'admin' || access === 'own')) {
//                     // Apply restrictions for non-admins or access='own' (including admin with own access)
//                     query.$or = [
//                         { type: 'Form16' },
//                         { type: 'Form12B' },
//                         {
//                             type: 'Form12BB',
//                             'metadata.form12BB.isPreviewEnabled': true, // Only Form12BB with isPreviewEnabled = true
//                         },
//                     ];
//                 }
//             }
//             // Apply date filters based on document type
//             if (category === 'Payroll' && (yearNum !== undefined || monthNum !== undefined)) {
//                 if (yearNum !== undefined && !isNaN(yearNum)) {
//                     query['metadata.payslip.year'] = yearNum;
//                 }
//                 if (monthNum !== undefined && !isNaN(monthNum)) {
//                     query['metadata.payslip.month'] = monthNum;
//                 }
//             }
//             else if (category === 'Timesheet' && (yearNum !== undefined || monthNum !== undefined)) {
//                 if (yearNum !== undefined && !isNaN(yearNum)) {
//                     query['metadata.timesheet.year'] = yearNum;
//                 }
//                 if (monthNum !== undefined && !isNaN(monthNum)) {
//                     query['metadata.timesheet.month'] = monthNum;
//                 }
//             }
//             else if ((category === 'EmployeeLifecycle' || type === 'OfferLetter' || type === 'HikeLetter') && (yearNum !== undefined || monthNum !== undefined)) {
//                 // Filter Hikes and Offers by their uploadDate (dispatch date)
//                 const start = new Date(yearNum || new Date().getFullYear(), (monthNum !== undefined ? monthNum - 1 : 0), 1);
//                 const end = new Date(yearNum || new Date().getFullYear(), (monthNum !== undefined ? monthNum : 12), 0, 23, 59, 59, 999);

//                 query.uploadDate = { $gte: start, $lte: end };
//             }
//             else if (category === 'Tax' && type === 'Form16' && financialYear) {
//                 query['metadata.form16.financialYear'] = financialYear;
//             }
//             else if (category === 'Tax' && type === 'Form12B' && financialYear) {
//                 query['metadata.form12B.financialYear'] = financialYear;
//             }
//             else if (category === 'Tax' && type === 'Form12BB' && financialYear) {
//                 query['metadata.form12BB.financialYear'] = financialYear;
//             }
//             else if (category === 'Attendance' && type === 'AttendanceFile' && yearNum !== undefined && !isNaN(yearNum)) {
//                 query['metadata.attendanceFile.year'] = yearNum;
//             }

//             console.log({ query, access, user: user._id }, 'Final query for documents');
//             console.log(JSON.stringify(query), "query in getDocuments")
//             // Execute query with proper error handling
//             const [total, documents] = await Promise.all([
//                 Document.countDocuments(query),
//                 Document.find(query)
//                     .populate('employeeId', 'name email employeeCode')
//                     .populate('uploadedBy', 'name email')
//                     .sort({ uploadDate: -1 })
//                     .skip(skip)
//                     .limit(limit)
//                     .lean()
//             ]);

//             const result = {
//                 data: documents,
//                 meta: {
//                     page,
//                     limit,
//                     total,
//                     totalPages: Math.ceil(total / limit)
//                 }
//             };
//             console.log(documents, "documents in getDocuments")
//             req.log.info({
//                 totalFound: total,
//                 returnedCount: documents.length,
//                 access,
//                 userId: user._id
//             }, 'Documents retrieved successfully');

//             return result;

//         } catch (error: any) {
//             req.log.error({
//                 error: error.message,
//                 stack: error.stack,
//                 query,
//                 userId: user._id
//             }, 'Error in getDocuments service');

//             return reply.status(500).send({
//                 success: false,
//                 error: 'Failed to retrieve documents'
//             });
//         }
//         /*
//                 try {
//                     if (scope === 'me') {
//                         query.employeeId = new Types.ObjectId(user._id);
//                     }
        
//                     else if (scope === 'subordinates') {
//                         if (user.role.toUpperCase() !== 'MANAGER') {
//                             return reply.code(403).send({ success: false, error: 'Unauthorized' });
//                         }
        
//                         const subordinates = await User.find({ managerId: user._id }, '_id').lean();
//                         const subordinateIds = subordinates.map(u => u._id.toString());
        
//                         if (employeeId) {
//                             if (!subordinateIds.includes(employeeId)) {
//                                 return reply.code(403).send({ success: false, error: 'Unauthorized subordinate' });
//                             }
//                             query.employeeId = new Types.ObjectId(employeeId);
//                         } else {
//                             query.employeeId = { $in: subordinateIds.map(id => new Types.ObjectId(id)) };
//                         }
//                     }
        
//                     else if (scope === 'all') {
//                         if (user.role.toUpperCase() !== 'ADMIN') {
//                             return reply.code(403).send({ success: false, error: 'Unauthorized' });
//                         }
//                         if (employeeId) {
//                             query.employeeId = new Types.ObjectId(employeeId);
//                         }
//                     }
        
//                     // Apply filters
//                     if (type) query.type = type;
        
//                     if (type === 'Payslip') {
//                         if (year !== undefined) query['metadata.payslip.year'] = year;
//                         if (month !== undefined) query['metadata.payslip.month'] = month;
//                     }
        
//                     if (type === 'TimesheetFile') {
//                         if (year !== undefined) query['metadata.timesheet.year'] = year;
//                         if (month !== undefined) query['metadata.timesheet.month'] = month;
//                     }
        
//                     if (type === 'Form16') {
//                         if (financialYear !== undefined) query['metadata.form16.financialYear'] = financialYear;
//                     }
//                     console.log(query, "updated Query")
//                     // Execute query with proper error handling
//                     const [total, documents] = await Promise.all([
//                         Document.countDocuments(query),
//                         Document.find(query)
//                             .populate('employeeId', 'name email')
//                             .populate('uploadedBy', 'name email')
//                             .sort({ uploadDate: -1 })
//                             .skip(skip)
//                             .limit(limit)
//                             .lean()
//                     ]);
        
//                     const result = {
//                         data: documents,
//                         meta: {
//                             page,
//                             limit,
//                             total,
//                             totalPages: Math.ceil(total / limit)
//                         }
//                     };
        
//                     req.log.info({
//                         totalFound: total,
//                         returnedCount: documents.length,
        
//                         userId: user._id
//                     }, 'Documents retrieved successfully');
        
//                     return result;
//                 } catch (err: any) {
//                     req.log.error(err);
//                     return reply.code(500).send({ success: false, error: 'Internal Server Error' });
//                 }*/

//     }

//     async getByIdDocuments(id: string, req: FastifyRequest): Promise<any> {
//         try {
//             // Validate ObjectId format
//             if (!Types.ObjectId.isValid(id)) {
//                 throw new Error('Invalid document ID');
//             }

//             const document = await Document.findOne({ _id: new Types.ObjectId(id) })
//                 .populate('employeeId', 'name email')
//                 .populate('uploadedBy', 'name email')
//                 .lean();

//             if (!document) {
//                 throw new Error('Document not found');
//             }

//             req.log.info({ documentId: id, userId: req.user?._id }, 'Single document retrieved successfully');

//             return {
//                 success: true,
//                 data: document
//             };
//         } catch (error: any) {
//             req.log.error({ error: error.message, stack: error.stack, documentId: id }, 'Error in getByIdDocuments service');
//             throw error; // Let the route handle the error response
//         }
//     }

//     //Genrate Timesheet
//     async generateTimesheet(userId: string, month: number, year: number, request: FastifyRequest): Promise<{ documentId: string; filePath: string }> {
//         try {
//             console.log("inside new")
//             // Validate inputs
//             if (month < 1 || month > 12 || year < 2000 || year > 2100) {
//                 throw new Error('Invalid month or year');
//             }

//             // Fetch user and timesheet data
//             const user = await User.findById(new Types.ObjectId(userId)).select('_id name phone joiningDate role');
//             if (!user) {
//                 throw new Error('User not found');
//             }

//             const startDate = new Date(Date.UTC(year, month - 1, 1));
//             const endDate = new Date(Date.UTC(year, month, 0));

//             const timesheets = await Timesheet.find({
//                 userId: new Types.ObjectId(userId),
//                 dateUTC: { $gte: startDate, $lte: endDate },
//             }).lean();

//             console.log(startDate, endDate, "timesheetService generateTimesheet");
//             console.log(timesheets, "timesheetService timesheets");

//             if (!timesheets.length) {
//                 throw new Error(`No timesheet data found for ${month}-${year}`);
//             }

//             // Generate Excel
//             const workbook = new ExcelJS.Workbook();
//             const templatePath = path.resolve(__dirname, '..', '..', 'templates', 'Timesheet_Template.xlsx');
//             await workbook.xlsx.readFile(templatePath);
//             const worksheet: any = workbook.getWorksheet(1);
//             console.log(worksheet, "worksheet generateTimesheet");

//             // Fill header section
//             worksheet.getCell('D1').value = 'Employee Id';
//             worksheet.getCell('E1').value = user._id.toString();
//             worksheet.getCell('D2').value = 'Employee Name';
//             worksheet.getCell('E2').value = user.name;
//             worksheet.getCell('F1').value = 'Contact Number';
//             worksheet.getCell('G1').value = user.phone || '';
//             worksheet.getCell('G2').value = user.joiningDate.toLocaleDateString();
//             worksheet.getCell('G3').value = user.role || '';

//             // Fill month name
//             worksheet.getCell('C4').value = monthNames[month - 1];

//             // Fill timesheet data
//             let rowNum = 7;
//             timesheets.forEach((day: ITimesheet, index: number) => {
//                 day.entries.forEach((entry) => {
//                     const row = worksheet.getRow(rowNum);
//                     row.getCell(1).value = index + 1;
//                     row.getCell(2).value = entry.description || '';
//                     row.getCell(3).value = entry.task;
//                     row.getCell(4).value = day.dateUTC.toLocaleDateString('en-GB');
//                     row.getCell(5).value = day.dateUTC.toLocaleDateString('en-US', { weekday: 'long' });
//                     row.getCell(6).value = entry.duration;
//                     row.getCell(7).value = '';
//                     rowNum++;
//                 });
//             });

//             // Save file locally first
//             const cleanName = user.name.replace(/[^a-zA-Z0-9]/g, '_');
//             const filename = `Doc_Timesheet_${userId.toString().slice(-5)}_${cleanName}_${month}_${year}.xlsx`;

//             // const filename = `Doc_Timesheet_${userId.toString().slice(-5)}_${user.name}_${month}_${year}.xlsx`;

//             const tempFilePath = path.resolve(__dirname, '..', '..', 'uploads', filename);

//             console.log(filename, "filename worksheet generateTimesheet");
//             console.log(tempFilePath, "tempFilePath worksheet generateTimesheet");

//             // Save workbook to temp location
//             await fsPromises.mkdir(path.dirname(tempFilePath), { recursive: true });
//             await workbook.xlsx.writeFile(tempFilePath);

//             // Upload to GCP Cloud Storage
//             const gcpResult = await uploadFileToGCP({
//                 filePath: tempFilePath,
//                 fileName: filename,
//                 employeeId: userId,
//                 category: 'Timesheet',
//                 type: 'TimesheetFile'
//             });

//             if (!gcpResult.success) {
//                 throw new Error(`Failed to upload timesheet to GCP: ${gcpResult.error}`);
//             }

//             const fileUrl = gcpResult.fileUrl!;
//             console.log(fileUrl, "fileUrl worksheet generateTimesheet")

//             // Clean up temp file
//             try {
//                 await fsPromises.unlink(tempFilePath);
//             } catch (err) {
//                 console.warn(`Failed to delete temp file ${tempFilePath}:`, err);
//             }
//             // Check for existing Document record
//             let document = await Document.findOne({
//                 employeeId: new Types.ObjectId(userId),
//                 type: 'TimesheetFile',
//                 'metadata.timesheet.month': month,
//                 'metadata.timesheet.year': year,
//             });


//             const documentData = {
//                 employeeId: new Types.ObjectId(userId),
//                 type: 'TimesheetFile' as const,
//                 category: 'Timesheet' as const,
//                 fileName: filename,
//                 filePath: fileUrl,
//                 tags: ['TimesheetFile', `${year}`, `month-${month}`],
//                 uploadDate: new Date(),
//                 uploadedBy: new Types.ObjectId(request.user?._id || userId),
//                 version: document ? document.version + 1 : 1,
//                 accessLevel: 'Private' as const,
//                 status: 'Generated' as const,
//                 metadata: {
//                     timesheet: {
//                         month,
//                         year,
//                     },
//                 },
//                 auditLog: [
//                     {
//                         action: 'Generate' as const,
//                         performedBy: new Types.ObjectId(request.user?._id || userId),
//                         timestamp: new Date(),
//                         details: `Timesheet Excel generated for ${user.name} for ${month}-${year}`,
//                     },
//                 ],
//             };

//             if (document) {
//                 // Delete old file from GCP
//                 if (document.filePath) {
//                     try {
//                         await deleteFileFromGCP(document.filePath);
//                     } catch (err) {
//                         console.warn(`Failed to delete old file from GCP: ${document.filePath}`, err);
//                     }
//                 }

//                 // Update existing document
//                 Object.assign(document, documentData);
//             } else {
//                 // Create new document
//                 document = new Document(documentData);
//             }

//             await document.save();

//             return { documentId: document._id.toString(), filePath: fileUrl };
//         } catch (error: any) {
//             throw new Error(`Failed to generate timesheet: ${error.message}`);
//         }
//     }
//     /*
//         * Delete payroll documents for a specific month and year
//     */
//     async deletePayrollDocuments(month: number, year: number): Promise<number> {
//         console.log(`Deleting payroll documents for ${month}-${year}`);

//         // Find all matching documents first to delete their files from GCP
//         const documentsToDelete = await Document.find({
//             type: 'Payslip',
//             'metadata.payslip.month': month,
//             'metadata.payslip.year': year
//         });

//         console.log(`Found ${documentsToDelete.length} documents to cleanup in GCP`);

//         // Delete files from GCP storage in parallel
//         await Promise.all(documentsToDelete.map(async (doc) => {
//             if (doc.filePath) {
//                 try {
//                     await deleteFileFromGCP(doc.filePath);
//                 } catch (err) {
//                     console.warn(`Failed to delete file from GCP for document ${doc._id}: ${doc.filePath}`, err);
//                 }
//             }
//         }));

//         // Now delete the records from the database
//         const result = await Document.deleteMany({
//             type: 'Payslip',
//             'metadata.payslip.month': month,
//             'metadata.payslip.year': year
//         });

//         console.log(`Deleted ${result.deletedCount} payroll document records for ${month}-${year}`);
//         return result.deletedCount;
//     }

//     /**
//         * Get payslip documents status for specific user's, month and year
//     */
//     async getPayslipDocumentsForUsers(
//         userIds: string[],
//         month: number,
//         year: number
//     ): Promise<any[]> {
//         const objectIds = userIds.map(id => new Types.ObjectId(id));
//         console.log(objectIds, 'objectIds getPayslipDocumentsForUsers');

//         const payslipDocuments = await Document.find({
//             employeeId: { $in: objectIds },
//             type: 'Payslip',
//             'metadata.payslip.month': month,
//             'metadata.payslip.year': year
//         }, {
//             employeeId: 1,
//             status: 1,
//             filePath: 1,
//             accessLevel: 1,
//             'metadata.payslip': 1,
//             createdAt: 1
//         })
//             .populate('employeeId', 'name email')

//         console.log(payslipDocuments, 'payslipDocuments getPayslipDocumentsForUsers');

//         // Transform to match legacy format
//         return payslipDocuments.map(doc => {
//             // Check if this is a manual upload (payrollId is null)
//             const isManual = doc.metadata.payslip?.payrollId === null || doc.metadata.payslip?.payrollId === undefined;

//             // Base response fields (always included)
//             const baseResponse: any = {
//                 _id: doc._id,
//                 userId: doc.employeeId._id,
//                 employeeId: doc.employeeId,
//                 status: doc.status,
//                 payslipUrl: doc.filePath,
//                 accessLevel: doc.accessLevel,
//                 isExport: doc.metadata.payslip?.isExport ?? (doc.status === 'Sent' || doc.status === 'Exported'),
//                 monthYear: doc.metadata.payslip?.monthYear,
//                 month: doc.metadata.payslip?.month,
//                 year: doc.metadata.payslip?.year,
//                 isManual: isManual, // Add flag to identify manual uploads
//             };

//             // Only include salary fields for generated payslips (not manual uploads)
//             if (!isManual) {
//                 baseResponse.netSalary = doc.metadata.payslip?.netSalary;
//                 baseResponse.grossSalary = doc.metadata.payslip?.paySummary?.gross;
//                 baseResponse.totalDeductions = doc.metadata.payslip?.paySummary?.deductions;
//                 baseResponse.reimbursement = doc.metadata.payslip?.paySummary?.reimbursement;
//                 baseResponse.bonus = doc.metadata.payslip?.paySummary?.bonus;
//             }

//             return baseResponse;
//         });
//     }

//     /**
//  * Get employee payslip documents (My Payslips)
//  */
//     async getEmployeePayslipDocuments(
//         userId: string,
//         month?: number,
//         year?: number
//     ): Promise<{ payslips: IPayslipResponse[] }> {
//         // Build filter
//         const filter: any = {
//             employeeId: new Types.ObjectId(userId),
//             type: 'Payslip',
//             status: { $in: ["Sent", "Exported"] }
//         };

//         if (month) filter['metadata.payslip.month'] = month;
//         if (year) filter['metadata.payslip.year'] = year;

//         console.log(filter, "filters getEmployeePayslipDocuments");

//         // Fetch payslip documents
//         const payslipDocs = await Document.find(filter)
//             .sort({ 'metadata.payslip.year': -1, 'metadata.payslip.month': -1 })
//             .populate('employeeId', 'name email');

//         console.log(payslipDocs, "payslipDocs getEmployeePayslipDocuments");

//         // Format the response
//         const formattedPayslips: IPayslipResponse[] = payslipDocs.map((doc) => {
//             const employee = doc.employeeId as any;
//             const payslipData = doc.metadata.payslip;
//             const paySummary = payslipData?.paySummary || {};

//             // Check if this is a manual upload (payrollId is null)
//             const isManual = payslipData?.payrollId === null || payslipData?.payrollId === undefined;

//             if (!payslipData) {
//                 return {
//                     payslipId: doc._id.toString(),
//                     employeeId: employee._id.toString(),
//                     employeeName: employee.name,
//                     email: employee.email,
//                     month: 0,
//                     year: 0,
//                     basic: 0,
//                     hra: 0,
//                     da: 0,
//                     otherAllowance: 0,
//                     monthYear: '',
//                     epfEmployee: 0,
//                     professionalTax: 0,
//                     incomeTax: 0,
//                     overtimePay: 0,
//                     grossSalary: 0,
//                     netSalary: 0,
//                     ctc: 0,
//                     totalDeductions: 0,
//                     reimbursement: 0,
//                     bonus: 0,
//                     payslipUrl: doc.filePath
//                 };
//             }

//             // Base response with common fields
//             const baseResponse: any = {
//                 payslipId: doc._id.toString(),
//                 employeeId: employee._id.toString(),
//                 employeeName: employee.name,
//                 email: employee.email,
//                 month: payslipData.month,
//                 year: payslipData.year,
//                 monthYear: payslipData.monthYear,
//                 payslipUrl: doc.filePath
//             };

//             // Only include salary fields for generated payslips (not manual uploads)
//             if (!isManual) {
//                 baseResponse.basic = paySummary && typeof paySummary === 'object' && 'basic' in paySummary ? Number(paySummary.basic) : 0;
//                 baseResponse.hra = paySummary && typeof paySummary === 'object' && 'hra' in paySummary ? Number(paySummary.hra) : 0;
//                 baseResponse.da = paySummary && typeof paySummary === 'object' && 'da' in paySummary ? Number(paySummary.da) : 0;
//                 baseResponse.otherAllowance = paySummary && typeof paySummary === 'object' && 'otherAllowance' in paySummary ? Number(paySummary.otherAllowance) : 0;
//                 baseResponse.epfEmployee = paySummary && typeof paySummary === 'object' && 'epfEmployee' in paySummary ? Number(paySummary.epfEmployee) : 0;
//                 baseResponse.professionalTax = paySummary && typeof paySummary === 'object' && 'professionalTax' in paySummary ? Number(paySummary.professionalTax) : 0;
//                 baseResponse.incomeTax = paySummary && typeof paySummary === 'object' && 'incomeTax' in paySummary ? Number(paySummary.incomeTax) : 0;
//                 baseResponse.overtimePay = paySummary && typeof paySummary === 'object' && 'overtimePay' in paySummary ? Number(paySummary.overtimePay) : 0;
//                 baseResponse.grossSalary = paySummary && typeof paySummary === 'object' && 'grossSalary' in paySummary ? Number(paySummary.grossSalary) : 0;
//                 baseResponse.netSalary = Number(payslipData.netSalary);
//                 baseResponse.ctc = paySummary && typeof paySummary === 'object' && 'ctc' in paySummary ? Number(paySummary.ctc) : 0;
//                 baseResponse.totalDeductions = paySummary && typeof paySummary === 'object' && 'totalDeductions' in paySummary ? Number(paySummary.totalDeductions) : 0;
//                 baseResponse.reimbursement = paySummary && typeof paySummary === 'object' && 'reimbursement' in paySummary ? Number(paySummary.reimbursement) : 0;
//                 baseResponse.bonus = paySummary && typeof paySummary === 'object' && 'bonus' in paySummary ? Number(paySummary.bonus) : 0;
//             } else {
//                 // For manual uploads, set all salary fields to 0 (or omit them)
//                 // Setting to 0 to maintain response structure compatibility
//                 baseResponse.basic = 0;
//                 baseResponse.hra = 0;
//                 baseResponse.da = 0;
//                 baseResponse.otherAllowance = 0;
//                 baseResponse.epfEmployee = 0;
//                 baseResponse.professionalTax = 0;
//                 baseResponse.incomeTax = 0;
//                 baseResponse.overtimePay = 0;
//                 baseResponse.grossSalary = 0;
//                 baseResponse.netSalary = 0;
//                 baseResponse.ctc = 0;
//                 baseResponse.totalDeductions = 0;
//                 baseResponse.reimbursement = 0;
//                 baseResponse.bonus = 0;
//             }

//             return baseResponse;
//         });

//         console.log(formattedPayslips, "formattedPayslips getEmployeePayslipDocuments");

//         return {
//             payslips: formattedPayslips,
//         };
//     }

//     /**
//  * Send payslips via email
//  */
//     async sendPayslipDocuments(data: ISendPayslipsRequest, userId: string): Promise<{
//         success: number;
//         failed: number;
//         results: Array<{
//             employeeId: string;
//             status: 'success' | 'failed';
//             message?: string;
//         }>;
//     }> {
//         const { month, year, recipients } = data;
//         console.log(month, year, recipients, "sendPayslipDocuments body");

//         // Get payslip documents and user details in parallel
//         const [payslipDocs, users] = await Promise.all([
//             Document.find({
//                 employeeId: { $in: recipients.map(id => new Types.ObjectId(id)) },
//                 type: 'Payslip',
//                 'metadata.payslip.month': month,
//                 'metadata.payslip.year': year,
//             }),
//             User.find({
//                 _id: { $in: recipients.map(id => new Types.ObjectId(id)) }
//             }).select('_id email name')
//         ]);

//         console.log(payslipDocs, "send payslipDocs");
//         console.log(users, "send users");

//         // Create maps for quick lookup
//         const payslipMap = new Map(payslipDocs.map(p => [p.employeeId.toString(), p]));
//         const userMap = new Map(users.map(u => [u._id.toString(), u]));
//         console.log(payslipMap, userMap, "payslipMap userMap");

//         // Process each recipient
//         const results = await Promise.all(recipients.map(async recipientId => {
//             try {
//                 const user = userMap.get(recipientId);
//                 const payslipDoc = payslipMap.get(recipientId);

//                 // Validate user and payslip exist
//                 if (!user || !user.email) {
//                     return {
//                         employeeId: recipientId,
//                         status: 'failed' as const,
//                         message: 'User not found or no email address'
//                     };
//                 }

//                 if (!payslipDoc || !payslipDoc.filePath) {
//                     return {
//                         employeeId: recipientId,
//                         status: 'failed' as const,
//                         message: 'Payslip document not found or not generated'
//                     };
//                 }

//                 // Send Email with Payslip
//                 const emailResult: any = await emailService.sendPayslipEmails(
//                     month, year, [{
//                         employeeId: recipientId,
//                         employeeName: user.name,
//                         email: user.email,
//                         payslipId: payslipDoc._id.toString(),
//                         payslipUrl: payslipDoc.filePath as string
//                     }],
//                     recipients
//                 );

//                 console.log(emailResult, "emailResult payslip gen");

//                 // If email sent successfully, update the document record
//                 if (emailResult.success) {
//                     const now = new Date();
//                     const messageId = emailResult.results?.[0]?.messageId || '';

//                     await Document.findByIdAndUpdate(
//                         payslipDoc._id,
//                         {
//                             status: 'Sent',
//                             'metadata.payslip.isExport': true,
//                             $push: {
//                                 auditLog: {
//                                     action: 'Send',
//                                     performedBy: new Types.ObjectId(userId),
//                                     timestamp: now,
//                                     details: `Payslip sent to ${user.email} - MessageID: ${messageId}`
//                                 }
//                             }
//                         }
//                     );
//                 }

//                 return {
//                     employeeId: recipientId,
//                     status: 'success' as const
//                 };

//             } catch (error: any) {
//                 return {
//                     employeeId: recipientId,
//                     status: 'failed' as const,
//                     message: error.message
//                 };
//             }
//         }));

//         // Summarize results
//         const successCount = results.filter(r => r.status === 'success').length;
//         const failedCount = results.length - successCount;

//         const res = {
//             success: successCount,
//             failed: failedCount,
//             results
//         };

//         console.log(res, "final response sendPayslipDocuments");

//         return {
//             success: successCount,
//             failed: failedCount,
//             results
//         };
//     }

//     //generate Payslip
//     async generatePayslip(month: number, year: number, userIds: string[]): Promise<IBulkGenerationResult> {
//         if (month < 1 || month > 12 || year < 2000 || year > 2100) {
//             throw new Error('Invalid month (1-12) or year (2000-2100).');
//         }

//         const firstDayOfMonth = new Date(`${year}-${month}-01`);
//         console.log(firstDayOfMonth, "firstDayOfMonth")
//         const lastDayOfMonth = new Date(year, month, 0);

//         const employees = await User.find({
//             _id: { $in: userIds.map((id) => new Types.ObjectId(id)) },
//             joiningDate: { $lt: lastDayOfMonth },
//         }).lean();

//         if (!employees.length) {
//             throw new Error('No eligible employees found for payslip generation.');
//         }

//         const payrolls = await Payroll.find({
//             month,
//             year,
//             employeeId: { $in: userIds.map((id) => new Types.ObjectId(id)) },
//             status: 'Completed',
//         }).lean();

//         if (!payrolls.length) {
//             throw new Error('No payroll data found for the specified users.');
//         }

//         const payslipPromises = employees.map(async (employee): Promise<IPayslipGenerationResult> => {
//             try {
//                 const payroll = payrolls.find((p) => p.employeeId.toString() === employee._id.toString());
//                 if (!payroll) {
//                     return { userId: employee._id.toString(), status: 'No Payroll Found' };
//                 }

//                 const monthStr = month <= 9 ? `0${month}` : `${month}`;
//                 const cleanName = employee.name.replace(/[^a-zA-Z0-9]/g, '_');
//                 const filename = `Doc_Payslip_${employee._id.toString().slice(-5)}_${cleanName}_${year}_${monthStr}.pdf`;
//                 const tempFilePath = path.resolve(__dirname, '..', '..', 'uploads', filename);

//                 await this.generatePayslipPDF(employee, payroll, filename);

//                 // Upload to GCP Cloud Storage
//                 const gcpResult = await uploadFileToGCP({
//                     filePath: tempFilePath,
//                     fileName: filename,
//                     employeeId: employee._id.toString(),
//                     category: 'Payroll',
//                     type: 'Payslip'
//                 });

//                 if (!gcpResult.success) {
//                     throw new Error(`Failed to upload payslip to GCP: ${gcpResult.error}`);
//                 }

//                 const fileUrl = gcpResult.fileUrl!;

//                 let document = await Document.findOne({
//                     employeeId: new Types.ObjectId(employee._id),
//                     type: 'Payslip',
//                     'metadata.payslip.month': month,
//                     'metadata.payslip.year': year,
//                 });

//                 const documentData = {
//                     employeeId: new Types.ObjectId(employee._id),
//                     type: 'Payslip' as const,
//                     category: 'Payroll' as const,
//                     fileName: filename,
//                     filePath: fileUrl,
//                     tags: ['Payslip', `${year}`, `month-${month}`],
//                     uploadDate: new Date(),
//                     uploadedBy: new Types.ObjectId(this.context.user?._id || employee._id),
//                     version: document ? document.version + 1 : 1,
//                     accessLevel: 'Private' as const,
//                     status: 'Generated' as const,
//                     metadata: {
//                         payslip: {
//                             payrollId: payroll._id,
//                             monthYear: `${year}-${monthStr}`,
//                             month,
//                             year,
//                             netSalary: payroll.netSalary,
//                             paySummary: {
//                                 gross: payroll.monthlyGross,
//                                 net: payroll.netSalary,
//                                 deductions: payroll.totalDeductions,
//                                 bonus: payroll.bonus || 0,
//                                 reimbursement: payroll.reimbursement || 0,
//                             },
//                             presentDays: payroll.presentDays,
//                             totalDays: payroll.totalDaysInMonth,
//                             payableDays: payroll.payableDays,
//                             isExport: false,
//                         },
//                     },
//                     auditLog: [
//                         {
//                             action: 'Generate' as const,
//                             performedBy: new Types.ObjectId(this.context.user?._id || employee._id),
//                             timestamp: new Date(),
//                             details: `Payslip generated for ${employee.name} for ${month}-${year}`,
//                         },
//                     ],
//                 };

//                 if (document) {
//                     // Delete old file from GCP
//                     if (document.filePath) {
//                         try {
//                             await deleteFileFromGCP(document.filePath);
//                         } catch (err) {
//                             console.warn(`Failed to delete old file from GCP: ${document.filePath}`, err);
//                         }
//                     }
//                     Object.assign(document, documentData);
//                 } else {
//                     document = new Document(documentData);
//                 }

//                 await document.save();

//                 return {
//                     userId: employee._id.toString(),
//                     status: document.version > 1 ? 'Payslip Updated' : 'Payslip Generated',
//                     documentId: document._id.toString(),
//                     pdfPath: fileUrl,
//                 };
//             } catch (error: any) {
//                 console.error(`Error generating payslip for employee ${employee._id}:`, error);
//                 return { userId: employee._id.toString(), status: 'Failed', error: error.message };
//             }
//         });

//         const payslipResults = await Promise.all(payslipPromises);
//         const summary = {
//             total: payslipResults.length,
//             generated: payslipResults.filter((r) => r.status === 'Payslip Generated').length,
//             updated: payslipResults.filter((r) => r.status === 'Payslip Updated').length,
//             failed: payslipResults.filter((r) => r.status === 'Failed').length,
//         };

//         return { success: true, payslips: payslipResults, summary };
//     }
//     //handlers
//     private async generatePayslipPDF(
//         employee: any,
//         payroll: any,
//         filename: string): Promise<void> {



//         const payslipDir = path.resolve(__dirname, '..', '..', 'uploads');
//         await fsPromises.mkdir(payslipDir, { recursive: true });

//         const payslipBaseName = path.basename(filename, '.pdf');
//         const outputDocxPath = path.join(payslipDir, `${payslipBaseName}.docx`);
//         const outputPdfPath = path.join(payslipDir, filename);


//         const normalizeCountry = (country: unknown): string | undefined =>
//             typeof country === 'string' ? country.toUpperCase() : undefined;

//         const sanitizeText = (value: unknown): string | undefined => {
//             if (value === undefined || value === null) {
//                 return undefined;
//             }
//             const text = String(value).trim();
//             if (
//                 !text ||
//                 text === '-' ||
//                 ['undefined', 'null', 'n/a', 'na'].includes(text.toLowerCase())
//             ) {
//                 return undefined;
//             }
//             return text;
//         };

//         const sanitizeAmount = (value: unknown): number => {
//             if (typeof value === 'number') {
//                 return Number.isFinite(value) ? value : 0;
//             }
//             if (typeof value === 'string') {
//                 const trimmed = value.trim();
//                 if (!trimmed) {
//                     return 0;
//                 }
//                 const numeric = Number(trimmed.replace(/,/g, ''));
//                 return Number.isFinite(numeric) ? numeric : 0;
//             }
//             return 0;
//         };

//         const formatLabel = (input: string | undefined | null): string => {
//             const sanitized = sanitizeText(input);
//             if (!sanitized) {
//                 return '-';
//             }
//             return sanitized
//                 .split('_')
//                 .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
//                 .join(' ');
//         };

//         const normalizedCountry = normalizeCountry(payroll.country) || 'IN';
//         const isUaePayroll = normalizedCountry === 'AE';

//         const activeBankData = employee.bankDetails?.find((bank: any) => bank?.isActive);
//         const govtIds = await this.getIdentityDocuments(employee._id);

//         const basicValue = sanitizeAmount(payroll.basic);
//         const hraValue = sanitizeAmount(payroll.hra);
//         const daValue = sanitizeAmount(payroll.da);
//         const otherAllowanceValue = sanitizeAmount(payroll.otherAllowance);
//         const travelAllowanceValue = sanitizeAmount(payroll.travelAllowance);
//         const reimbursementValue = sanitizeAmount(payroll.reimbursement);
//         const assignedBasicValue = sanitizeAmount(payroll.assigned?.basic);
//         const assignedHraValue = sanitizeAmount(payroll.assigned?.hra);
//         const assignedOtherAllowanceValue = sanitizeAmount(payroll.assigned?.otherAllowance);
//         const assignedTravelAllowanceValue = sanitizeAmount(payroll.assigned?.travelAllowance);
//         const assignedReimbursementValue = sanitizeAmount(payroll.assigned?.reimbursementAllowance);

//         const holdSalaryValue = isUaePayroll ? sanitizeAmount(payroll.holdSalary) : (payroll.holdSalary || 0);

//         const customReimbursementsTotal = (payroll.customReimbursements || []).reduce(
//             (sum: number, item: any) => sum + sanitizeAmount(item?.value),
//             0
//         );
//         const customDeductionsTotal = (payroll.customDeductions || []).reduce(
//             (sum: number, item: any) => sum + sanitizeAmount(item?.value),
//             0
//         );

//         const totalEarnings =
//             basicValue + hraValue + otherAllowanceValue + daValue + travelAllowanceValue + holdSalaryValue + customReimbursementsTotal;

//         const netSalaryValue = sanitizeAmount(payroll.netSalary);
//         const netPayNumeric = Math.round(netSalaryValue);
//         const netPayValue = await this.numberToWords(netPayNumeric);
//         const netPayWords =
//             netPayNumeric > 0
//                 ? `${isUaePayroll ? 'Dirhams' : 'Rupees'} ${netPayValue} only`
//                 : `${isUaePayroll ? 'Dirhams' : 'Rupees'} ${netPayValue}`;

//         const employeeDesignation =
//             sanitizeText(employee.specificRole) || formatLabel(employee.role);

//         // Prepare template data
//         const templateData = {
//             // Personal Info
//             empName: sanitizeText(employee.name) || '-',
//             empJoinDate: formatDateToDDMMYYYY(employee.joiningDate),
//             empRole: employeeDesignation,
//             empDept: formatLabel(employee.departmentId),
//             empLocation: formatLabel(employee.location),
//             // Employee No: Use employeeCode (primary) or biometricId (fallback)
//             empNo: sanitizeText(employee.employeeCode) || sanitizeText(employee.biometricId) || '-',

//             // Bank & ID Info
//             bankName: sanitizeText(activeBankData?.bankName) || '-',
//             bankAccNo: sanitizeText(activeBankData?.accountNumber) || '-',
//             // PAN: Priority: Document collection > governmentIds > fallback to '-'
//             panNo: sanitizeText(govtIds?.panNumber) || sanitizeText(employee.governmentIds?.pan?.number) || '-',
//             // PF No: Priority: employee.pfNumber > Document collection > governmentIds > fallback to '-'
//             pfNo: sanitizeText(employee.pfNumber) || sanitizeText(govtIds?.pfNumber) || sanitizeText(employee.governmentIds?.pf?.number) || '-',
//             // PF UAN: Priority: employee.uanNumber > Document collection > governmentIds > fallback to '-'
//             pfUan: sanitizeText(employee.uanNumber) || sanitizeText(govtIds?.pfUan) || sanitizeText(employee.governmentIds?.pf?.uan) || '-',

//             // Payslip Info
//             payMonth: this.getMonthName(payroll.month),
//             payYear: payroll.year.toString(),

//             daysPresent: payroll.presentDays,
//             daysLOP: payroll.LOPDays,
//             effectiveDays: payroll.payableDays,
//             monthDays: payroll.totalDaysInMonth,
//             country: normalizedCountry,

//             // Earnings
//             earnActual: {
//                 basic: formatCurrency(basicValue, normalizedCountry),
//                 hra: formatCurrency(hraValue, normalizedCountry),
//                 other: formatCurrency(otherAllowanceValue, normalizedCountry),
//                 travelAllowance: formatCurrency(travelAllowanceValue, normalizedCountry),
//                 reimbursement: formatCurrency(reimbursementValue, normalizedCountry),
//                 ...((payroll.holdSalary && payroll.holdSalary > 0) && {
//                     holdSalary: formatCurrency(payroll.holdSalary, normalizedCountry)
//                 }), // ✅ NEW: Hold Salary (Only if > 0)
//                 total: formatCurrency(totalEarnings, normalizedCountry)
//             },
//             earnFull: {
//                 basic: formatCurrency(assignedBasicValue, normalizedCountry),
//                 hra: formatCurrency(assignedHraValue, normalizedCountry),
//                 other: formatCurrency(assignedOtherAllowanceValue, normalizedCountry),
//                 travelAllowance: formatCurrency(assignedTravelAllowanceValue, normalizedCountry),
//                 reimbursement: formatCurrency(assignedReimbursementValue, normalizedCountry),
//                 ...((payroll.holdSalary && payroll.holdSalary > 0) && {
//                     holdSalary: formatCurrency(payroll.holdSalary, normalizedCountry)
//                 }), // ✅ NEW: Add Hold Salary to Full Column Object
//                 total: formatCurrency(
//                     assignedBasicValue +
//                     assignedHraValue +
//                     assignedOtherAllowanceValue +
//                     assignedTravelAllowanceValue +
//                     (payroll.holdSalary || 0) +
//                     customReimbursementsTotal, // Keep Full total aligned with displayed custom reimbursement rows
//                     normalizedCountry
//                 )
//             },

//             // Deductions - Only include non-zero values (so template rows can be conditional)
//             deduction: (() => {
//                 const deductionObj: any = {
//                     total: formatCurrency(Number(payroll.totalDeductions || 0) + customDeductionsTotal, normalizedCountry),
//                 };

//                 const pfVal = Number((payroll as any).epfEmployee ?? 0);
//                 const lopVal = Number((payroll as any).leaveDeductions ?? 0);
//                 const ptVal = Number((payroll as any).professionalTax ?? 0);
//                 const itVal = Number((payroll as any).incomeTax ?? 0);

//                 if (pfVal > 0) {
//                     deductionObj.pf = formatCurrency(pfVal, normalizedCountry);
//                 }
//                 if (lopVal > 0) {
//                     deductionObj.lop = formatCurrency(lopVal, normalizedCountry);
//                 }
//                 if (ptVal > 0) {
//                     deductionObj.pt = formatCurrency(ptVal, normalizedCountry);
//                 }
//                 if (itVal > 0) {
//                     deductionObj.it = formatCurrency(itVal, normalizedCountry);
//                 }
//                 const tdsVal = Number((payroll as any).tdsDeduction ?? 0);
//                 const noticeVal = Number((payroll as any).noticePeriodRecovery ?? 0);
//                 if (tdsVal > 0) {
//                     deductionObj.tds = formatCurrency(tdsVal, normalizedCountry);
//                 }
//                 if (noticeVal > 0) {
//                     deductionObj.noticeRecovery = formatCurrency(noticeVal, normalizedCountry);
//                 }

//                 return deductionObj;
//             })(),

//             // Dynamic Earnings List (only non-zero items)
//             allEarnings: (() => {
//                 const earningsArray: any[] = [];

//                 // Helper to add row if actual or full > 0
//                 const pushIfValid = (label: string, actual: number, full: number) => {
//                     if (actual > 0 || full > 0) {
//                         earningsArray.push({
//                             label,
//                             fullAmount: formatCurrency(full, normalizedCountry),
//                             actualAmount: formatCurrency(actual, normalizedCountry)
//                         });
//                     }
//                 };

//                 pushIfValid('BASIC', basicValue, assignedBasicValue);
//                 pushIfValid('HRA', hraValue, assignedHraValue);
//                 pushIfValid('DEARNESS ALLOWANCE', daValue, 0); // Usually no "full" DA assigned separately
//                 pushIfValid('OTHER ALLOWANCE', otherAllowanceValue, assignedOtherAllowanceValue);
//                 pushIfValid('TRAVEL ALLOWANCE', travelAllowanceValue, assignedTravelAllowanceValue);
//                 pushIfValid('HOLD SALARY', holdSalaryValue, holdSalaryValue);
//                 pushIfValid('REIMBURSEMENT', reimbursementValue, assignedReimbursementValue);

//                 if (sanitizeAmount(payroll.airTicketAllowance) > 0 || sanitizeAmount(payroll.assigned?.airTicketAllowance) > 0) {
//                     pushIfValid('AIR TICKET ALLOWANCE', sanitizeAmount(payroll.airTicketAllowance), sanitizeAmount(payroll.assigned?.airTicketAllowance));
//                 }
//                 if (sanitizeAmount(payroll.medicalAllowance) > 0 || sanitizeAmount(payroll.assigned?.medicalAllowance) > 0) {
//                     pushIfValid('MEDICAL ALLOWANCE', sanitizeAmount(payroll.medicalAllowance), sanitizeAmount(payroll.assigned?.medicalAllowance));
//                 }
//                 if (payroll.customReimbursements && payroll.customReimbursements.length > 0) {
//                     payroll.customReimbursements.forEach((item: any) => {
//                         if (sanitizeAmount(item?.value) > 0) {
//                             pushIfValid(String(item.name || '').toUpperCase(), sanitizeAmount(item.value), sanitizeAmount(item.value));
//                         }
//                     });
//                 }

//                 return earningsArray;
//             })(),

//             // Dynamic Deductions List (only non-zero items)
//             allDeductions: (() => {
//                 const deductionsArray: any[] = [];
//                 const pfVal = Number((payroll as any).epfEmployee ?? 0);
//                 const lopVal = Number((payroll as any).leaveDeductions ?? 0);
//                 const ptVal = Number((payroll as any).professionalTax ?? 0);
//                 const itVal = Number((payroll as any).incomeTax ?? 0);
//                 const tdsVal = Number((payroll as any).tdsDeduction ?? 0);
//                 const noticeVal = Number((payroll as any).noticePeriodRecovery ?? 0);

//                 if (pfVal > 0) deductionsArray.push({ label: 'PROVIDENT FUND', amount: formatCurrency(pfVal, normalizedCountry) });
//                 if (lopVal > 0) deductionsArray.push({ label: 'LOSS OF PAY', amount: formatCurrency(lopVal, normalizedCountry) });
//                 if (itVal > 0) deductionsArray.push({ label: 'INCOME TAX', amount: formatCurrency(itVal, normalizedCountry) });
//                 if (ptVal > 0) deductionsArray.push({ label: 'PROFESSIONAL TAX', amount: formatCurrency(ptVal, normalizedCountry) });
//                 if (tdsVal > 0) deductionsArray.push({ label: 'TDS (1%)', amount: formatCurrency(tdsVal, normalizedCountry) });
//                 if (noticeVal > 0) deductionsArray.push({ label: 'NOTICE PERIOD RECOVERY', amount: formatCurrency(noticeVal, normalizedCountry) });
//                 if (payroll.customDeductions && payroll.customDeductions.length > 0) {
//                     payroll.customDeductions.forEach((item: any) => {
//                         if (sanitizeAmount(item?.value) > 0) {
//                             deductionsArray.push({ label: String(item.name || '').toUpperCase(), amount: formatCurrency(sanitizeAmount(item.value), normalizedCountry) });
//                         }
//                     });
//                 }

//                 return deductionsArray;
//             })(),

//             // Net Pay
//             netPay: formatCurrency(netSalaryValue, normalizedCountry),
//             netPayWords: netPayWords
//         };

//         console.log("=== DEDUCTION DEBUG ===");
//         console.log("Payroll deduction values:", {
//             epfEmployee: (payroll as any).epfEmployee,
//             leaveDeductions: (payroll as any).leaveDeductions,
//             professionalTax: (payroll as any).professionalTax,
//             incomeTax: (payroll as any).incomeTax,
//             totalDeductions: payroll.totalDeductions
//         });
//         console.log("Deduction object:", templateData.deduction);
//         console.log("Deduction keys:", Object.keys(templateData.deduction));
//         console.log("======================");
//         console.log(templateData, "templateData");
//         console.log({
//             payrollTravelAllowance: payroll.travelAllowance,
//             sanitizedTravelAllowance: travelAllowanceValue,
//             assignedTravelAllowance: payroll.assigned?.travelAllowance,
//             sanitizedAssignedTravelAllowance: assignedTravelAllowanceValue,
//             country: normalizedCountry,
//         }, "document service travel allowance debug");

//         try {
//             // Replace placeholders in DOCX template
//             await this.replacePlaceholdersInDocx(
//                 // path.join(process.cwd(), 'CD_paySlip.docx'),
//                 //path.join(process.cwd(), 'CD_payslip_Dubai Zuno.docx'),
//                 // path.join(process.cwd(), 'CD_paySlip old2.docx'),
//                 // path.join(process.cwd(), 'CD_paySlip_new.docx'),
//                 path.join(process.cwd(), 'CD_paySlip old3.docx'),

//                 outputDocxPath,
//                 templateData
//             );

//             // Convert DOCX to PDF
//             await this.convertDocxToPDF(outputDocxPath, outputPdfPath);

//         } catch (error: any) {
//             console.error('Payslip Generation Error:', error);
//             throw new Error(`Failed to generate payslip for ${employee.name}: ${error.message}`);
//         }
//     }

//     private async replacePlaceholdersInDocx(inputPath: string, outputPath: string, data: any) {
//         try {
//             console.log("replacePlaceholdersInDocx", inputPath, outputPath);
//             console.log("Template data keys:", Object.keys(data));

//             // Check if template file exists
//             if (!fs.existsSync(inputPath)) {
//                 throw new Error(`Template file not found: ${inputPath}`);
//             }

//             const content = fs.readFileSync(inputPath, "binary");
//             const zip = new PizZip(content);
//             const doc = new Docxtemplater(zip, {
//                 paragraphLoop: true,
//                 linebreaks: true,
//                 nullGetter: () => {
//                     // Return empty string for missing properties instead of undefined
//                     return '';
//                 }
//             });

//             // Log deduction data before rendering
//             console.log("=== TEMPLATE RENDERING DEBUG ===");
//             console.log("Deduction object:", JSON.stringify(data.deduction, null, 2));
//             console.log("Deductions array:", JSON.stringify(data.deductions, null, 2));
//             console.log("================================");

//             doc.render(data);

//             const updatedContent = doc.getZip().generate({ type: "nodebuffer" });
//             fs.writeFileSync(outputPath, updatedContent);
//         } catch (error: any) {
//             console.error('DOCX Template Rendering Error:', error);

//             // Handle Docxtemplater MultiError
//             if (error.properties && error.properties.errors && Array.isArray(error.properties.errors)) {
//                 const errors = error.properties.errors.map((err: any) => ({
//                     name: err.name,
//                     message: err.message,
//                     properties: err.properties
//                 }));
//                 console.error('Template errors:', JSON.stringify(errors, null, 2));
//                 throw new Error(`Template rendering failed: ${errors.map((e: any) => e.message).join('; ')}`);
//             }

//             throw error;
//         }
//     }

//     private async convertDocxToPDF(docxPath: string, pdfPath: string): Promise<void> {
//         return new Promise((resolve, reject) => {
//             try {
//                 const docxBuffer = fs.readFileSync(docxPath);

//                 convertToPdf(docxBuffer, '.pdf', undefined)
//                     .then((pdfBuffer) => {
//                         fs.writeFileSync(pdfPath, pdfBuffer);
//                         console.log(`PDF generated successfully at: ${pdfPath}`);
//                         resolve();
//                     })
//                     .catch((conversionError) => {
//                         console.error('PDF Conversion Error:', conversionError);
//                         reject(conversionError);
//                     });
//             } catch (error) {
//                 console.error('PDF Conversion Setup Error:', error);
//                 reject(error);
//             }
//         });
//     }

//     private async numberToWords(num: number): Promise<string> {
//         if (num === 0) return "zero";

//         const belowTwenty = [
//             "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
//             "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
//             "seventeen", "eighteen", "nineteen"
//         ];

//         const tens = [
//             "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"
//         ];

//         const thousandUnits = ["", "thousand", "million"];

//         function helper(n: number): string {
//             if (n === 0) return "";
//             else if (n < 20) return belowTwenty[n] + " ";
//             else if (n < 100) return tens[Math.floor(n / 10)] + " " + helper(n % 10);
//             else return belowTwenty[Math.floor(n / 100)] + " hundred " + helper(n % 100);
//         }

//         let result = "";
//         let unitIndex = 0;

//         while (num > 0) {
//             const chunk = num % 1000;
//             if (chunk !== 0) {
//                 result = helper(chunk) + thousandUnits[unitIndex] + " " + result;
//             }
//             num = Math.floor(num / 1000);
//             unitIndex++;
//         }

//         return result.trim();
//     }

//     private getMonthName(monthNumber: number): string {
//         const months = [
//             'January', 'February', 'March', 'April', 'May', 'June',
//             'July', 'August', 'September', 'October', 'November', 'December'
//         ];
//         return months[monthNumber - 1] || 'Unknown';
//     }


//     //handlers get Ids 
//     private getIdentityDocuments = async (employeeId: string): Promise<IdentityDocumentResult> => {
//         try {
//             if (!Types.ObjectId.isValid(employeeId)) {
//                 throw new Error('Invalid employeeId');
//             }

//             const docs = await Document.find({
//                 employeeId: new Types.ObjectId(employeeId),
//                 category: 'Certification',
//                 'metadata.certificate.certificateType': 'IdentityProof',
//             }).lean();

//             if (!docs || docs.length === 0) {
//                 return { panNumber: undefined, pfNumber: undefined, pfUan: undefined };
//             }

//             const result: IdentityDocumentResult = {};

//             docs.forEach((doc: IDocument) => {
//                 if (doc.metadata?.certificate?.idDetails) {
//                     const { idType, idNumber, uanNumber } = doc.metadata.certificate.idDetails;

//                     if (idType === 'PAN' && idNumber) {
//                         result.panNumber = idNumber;
//                     } else if (idType === 'PF' && idNumber) {
//                         result.pfNumber = idNumber;
//                         result.pfUan = uanNumber;
//                     }
//                 }
//             });

//             return result;
//         } catch (error) {
//             console.error('Error fetching identity documents:', error);
//             throw new Error(`Failed to fetch identity documents: ${error instanceof Error ? error.message : String(error)}`);
//         }
//     };


//     //Form16 Uploads 
//     async uploadForm16(userId: Types.ObjectId, userName: string, pan: string, fileName: string, fileContent: Buffer, financialYear: string) {
//         const uploadsDir = path.resolve(__dirname, '..', '..', 'uploads');
//         await fsPromises.mkdir(uploadsDir, { recursive: true });

//         const cleanName = userName.replace(/[^a-zA-Z0-9]/g, '_');
//         const basefileName = `Doc_Form16_${cleanName}_${fileName}`;
//         const tempFilePath = path.join(uploadsDir, basefileName);
//         await fsPromises.writeFile(tempFilePath, fileContent);

//         // Upload to GCP Cloud Storage
//         const gcpResult = await uploadFileToGCP({
//             filePath: tempFilePath,
//             fileName: basefileName,
//             employeeId: userId.toString(),
//             category: 'Tax',
//             type: 'Form16'
//         });

//         if (!gcpResult.success) {
//             throw new Error(`Failed to upload Form16 to GCP: ${gcpResult.error}`);
//         }

//         const fileUrl = gcpResult.fileUrl!;

//         // Clean up temp file
//         try {
//             await fsPromises.unlink(tempFilePath);
//         } catch (err) {
//             console.warn(`Failed to delete temp file ${tempFilePath}:`, err);
//         }
//         // Check for existing document for this user, PAN, and FY
//         let document = await Document.findOne({
//             employeeId: userId,
//             type: 'Form16',
//             'metadata.form16.financialYear': financialYear,
//         });
//         console.log(document, "docs")
//         if (document) {
//             // Only update necessary fields, increment version, and push to audit log
//             document.fileName = fileName;
//             document.filePath = fileUrl;
//             document.uploadDate = new Date();
//             document.status = 'Generated';
//             document.metadata = {
//                 form16: {
//                     pan,
//                     financialYear,
//                     tdsAmount: 0 // Default to 0, as tdsAmount is required by the type
//                 }
//             };
//             document.version = (document.version || 1) + 1;
//             if (!document.auditLog) {
//                 document.auditLog = [];
//             }
//             document.auditLog.push({
//                 action: 'Generate',
//                 performedBy: new Types.ObjectId(this.context.user?._id),
//                 timestamp: new Date(),
//                 details: `Form 16 re-uploaded for User ${userName} PAN ${pan}`,
//             });
//             await document.save();
//         } else {
//             document = new Document({
//                 employeeId: userId,
//                 type: 'Form16',
//                 category: 'Tax',
//                 fileName,
//                 filePath: fileUrl,
//                 uploadDate: new Date(),
//                 accessLevel: 'Private',
//                 status: 'Generated',
//                 tags: ['Form16', `${financialYear}`],
//                 metadata: {
//                     form16: {
//                         pan,
//                         financialYear,
//                         tdsAmount: 0 // Default to 0, as tdsAmount is required by the type
//                     }
//                 },
//                 version: 1,
//                 auditLog: [{
//                     action: 'Upload',
//                     performedBy: new Types.ObjectId(this.context.user?._id),
//                     timestamp: new Date(),
//                     details: `Form 16 uploaded for User ${userName} PAN ${pan}`,
//                 }]
//             });
//             await document.save();
//         }

//         return document;
//     }

//     //upload Form12B

//     async uploadForm12B(files: any, formData: IForm12BSubmission, userId: string): Promise<IDocument> {
//         //FastifyRequest<{ Body: IForm12BSubmission; Files: any[] }>
//         try {
//             console.log(formData, "uploadForm12B files formData userId");

//             // Validate employeeId
//             if (!Types.ObjectId.isValid(formData.employeeId)) {
//                 throw new Error('Invalid employee ID');
//             }
//             const employeeId = new Types.ObjectId(formData.employeeId);
//             const { financialYear, previousEmployer, employmentPeriod, salaryEarned, tdsDeducted, taxDeclarationId } = formData;

//             // Validate employment period
//             const startDate = new Date(employmentPeriod.startDate);
//             const endDate = new Date(employmentPeriod.endDate);
//             const fyStart = new Date(parseInt(financialYear), 3, 1); // April 1st
//             const fyEnd = new Date(parseInt(financialYear) + 1, 2, 31); // March 31st next year
//             if (startDate >= endDate || startDate < fyStart || endDate > fyEnd) {
//                 throw new Error('Invalid employment period');
//             }

//             // Check if Form 12B already exists
//             const existingDocument = await Document.findOne({
//                 employeeId,
//                 type: 'Form12B',
//                 'metadata.form12B.financialYear': financialYear,
//             });
//             console.log(existingDocument, "existingDocument uploadForm12B");
//             const isReupload = !!existingDocument;
//             console.log(isReupload, "isReupload uploadForm12B");

//             /*  const allowedStatusesForReupload = ['ResubmissionRequested'];
//               //'Rejected'
//               if (
//                   isReupload &&
//                   !allowedStatusesForReupload.includes(existingDocument.metadata.form12B?.status ?? '')
//               ) {
//                   throw new Error('Form 12B already submitted for this financial year and cannot be re-uploaded');
//               }
//                   */
//             // Check isForm12BApplicable in TaxDeclaration
//             const taxDeclaration = await TaxDeclaration.findOne({ employeeId, financialYear });
//             console.log(taxDeclaration, "taxDeclaration uploadForm12B");
//             if (!taxDeclaration) {
//                 throw new Error('Tax Declaration not found');
//             }
//             if (!taxDeclaration.isForm12BApplicable) {
//                 throw new Error('Form 12B not applicable for this employee');
//             }
//             if (taxDeclaration._id.toString() !== taxDeclarationId) {
//                 throw new Error('Tax Declaration ID mismatch');
//             }

//             // Validate file
//             if (!files || files.length === 0) {
//                 throw new Error('No file uploaded');
//             }
//             const file = files[0];

//             // Store file temporarily and upload to GCP
//             const uploadsDir = path.resolve(__dirname, '..', '..', 'Uploads');
//             await fsPromises.mkdir(uploadsDir, { recursive: true });
//             const originalExtension = path.extname(file.originalname);
//             const cleanFinancialYear = financialYear.replace(/[^a-zA-Z0-9]/g, '_');
//             const newFileName = `Doc_Form12B_${cleanFinancialYear}_${previousEmployer.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}_${originalExtension}`;
//             const tempFilePath = path.join(uploadsDir, newFileName);
//             await fsPromises.rename(file.path, tempFilePath);

//             // Upload to GCP Cloud Storage
//             const gcpResult = await uploadFileToGCP({
//                 filePath: tempFilePath,
//                 fileName: newFileName,
//                 employeeId: employeeId.toString(),
//                 category: 'Tax',
//                 type: 'Form12B'
//             });

//             if (!gcpResult.success) {
//                 throw new Error(`Failed to upload Form12B to GCP: ${gcpResult.error}`);
//             }

//             const fileUrl = gcpResult.fileUrl!;

//             // Clean up temp file
//             try {
//                 await fsPromises.unlink(tempFilePath);
//             } catch (err) {
//                 console.warn(`Failed to delete temp file ${tempFilePath}:`, err);
//             }

//             // Handle existing document (delete old file if re-upload)
//             let document: IDocument;
//             if (isReupload) {
//                 if (existingDocument.filePath) {
//                     try {
//                         await deleteFileFromGCP(existingDocument.filePath);
//                     } catch (err: any) {
//                         console.warn({ filePath: existingDocument.filePath, error: err.message }, 'Failed to delete old file from GCP');
//                     }
//                 }
//                 const updatedDoc = await Document.findByIdAndUpdate(
//                     existingDocument._id,
//                     {
//                         fileName: newFileName,
//                         filePath: fileUrl,
//                         uploadDate: new Date(),
//                         metadata: {
//                             form12B: {
//                                 financialYear,
//                                 previousEmployer,
//                                 employmentPeriod: { startDate: new Date(startDate), endDate: new Date(endDate) },
//                                 salaryEarned: Number(salaryEarned),
//                                 tdsDeducted: Number(tdsDeducted),
//                                 status: 'Pending',
//                                 isLocked: false,
//                             },
//                         },
//                         auditLog: [
//                             ...(existingDocument.auditLog || []),
//                             {
//                                 action: 'Re-upload',
//                                 performedBy: new Types.ObjectId(userId),
//                                 timestamp: new Date(),
//                                 details: 'Form 12B re-uploaded.',
//                             },
//                         ],
//                         status: 'Uploaded', // Reset status on re-upload
//                     },
//                     { new: true, runValidators: true }
//                 );
//                 if (!updatedDoc) {
//                     throw new Error('Failed to update document');
//                 }
//                 document = updatedDoc;
//                 taxDeclaration.form12B = document._id; // Update reference
//             } else {
//                 document = new Document({
//                     employeeId,
//                     type: 'Form12B',
//                     category: 'Tax',
//                     fileName: newFileName,
//                     tag: ['Form12B', `${financialYear}`, `Employer-${previousEmployer.name}`],
//                     filePath: fileUrl,
//                     uploadedBy: new Types.ObjectId(userId),
//                     uploadDate: new Date(),
//                     accessLevel: 'Private',
//                     status: 'Uploaded',
//                     metadata: {
//                         form12B: {
//                             financialYear,
//                             previousEmployer,
//                             employmentPeriod: { startDate: new Date(startDate), endDate: new Date(endDate) },
//                             salaryEarned: Number(salaryEarned),
//                             tdsDeducted: Number(tdsDeducted),
//                             status: 'Pending',
//                             isLocked: false,
//                         },
//                     },
//                     auditLog: [
//                         {
//                             action: 'Upload',
//                             performedBy: new Types.ObjectId(userId),
//                             timestamp: new Date(),
//                             details: 'Form 12B uploaded.',
//                         },
//                     ],
//                 });
//                 await document.save();
//                 taxDeclaration.form12B = document._id; // Set reference
//             }

//             await taxDeclaration.save();
//             console.log(taxDeclaration, "taxDeclaration after save uploadForm12B");
//             console.log(document, "document uploadForm12B");
//             return document;
//         } catch (error: any) {
//             throw new Error(`Failed to submit Form 12B: ${error.message}`);
//         }
//     }

//     //Form12B Approvals
//     async updateForm12BStatus(id: string, status: 'Verified' | 'Rejected' | 'ResubmissionRequested', userId: string, comments?: string): Promise<IDocument> {

//         try {
//             const existingDocument = await Document.findById(id);
//             if (!existingDocument || existingDocument.type !== 'Form12B') {
//                 throw new Error('Document not found or not a Form 12B');
//             }
//             if (existingDocument?.metadata.form12B?.status === 'Verified' || existingDocument?.metadata.form12B?.status === 'Rejected') {
//                 throw new Error('Form 12B has already been processed');
//             }
//             if (existingDocument?.metadata.form12B?.isLocked) {
//                 throw new Error('Form 12B is locked and cannot be updated');
//             }
//             // Update document status and audit log
//             if (!existingDocument.metadata.form12B) {
//                 throw new Error('Form 12B metadata is missing');
//             }
//             existingDocument.metadata.form12B.status = status;
//             existingDocument.metadata.form12B.isLocked = true; // Lock the document after processing
//             existingDocument.markModified('metadata.form12B');// Ensure Mongoose tracks changes
//             existingDocument.status = status === 'Verified' ? 'Acknowledged' : existingDocument.status;
//             if (!existingDocument.auditLog) {
//                 existingDocument.auditLog = [];
//             }
//             existingDocument.auditLog.push({
//                 action: status === 'Verified' ? 'Verify' : 'Update',
//                 performedBy: new Types.ObjectId(userId),
//                 timestamp: new Date(),
//                 details: comments ? `Form 12B ${status} with comments: ${comments}`
//                     : `Form 12B ${status} without comments`,
//             });


//             // If status is Verified, update the Tax Declaration reference
//             if (status === 'Verified') {
//                 console.log("inside verified updateForm12BStatus");
//                 const form12bId = existingDocument._id.toString();
//                 const tdsAmount = Number(existingDocument.metadata.form12B.tdsDeducted) || 0;
//                 const financialYear = existingDocument.metadata.form12B.financialYear;

//                 // Call TaxDeclarationService.processForm12BTDS
//                 const taxDeclarationService = new TaxDeclarationService(this.context);
//                 const taxDeclaration = await taxDeclarationService.processForm12BTDS(
//                     {
//                         form12bId,
//                         tdsAmount,
//                         financialYear
//                     });
//                 console.log(taxDeclaration, "taxDeclaration updateForm12BStatus");
//             }


//             const updatedDocument = await existingDocument.save();
//             console.log(updatedDocument, "updatedDocument updateForm12BStatus");
//             return updatedDocument;
//         } catch (error: any) {
//             console.error('Error updating Form 12B status:', error);
//             throw new Error(`Failed to update Form 12B status: ${error.message}`);

//         }

//     }

//     //generate Form12BB
//     async generateForm12BB(data: IForm12BBGenerate): Promise<IDocument> {
//         console.log(data, "generateForm12BB data");
//         const { employeeId, financialYear } = data;

//         if (!employeeId) {
//             throw new Error("Employee ID is required");
//         }
//         const effectiveFY = financialYear || getCurrentFinancialYear();

//         // Fetch user
//         const user = await User.findById(employeeId).select("name email").lean();
//         console.log(user, "user generateForm12BB");
//         if (!user) {
//             throw new Error("Employee not found");
//         }

//         // Fetch tax declaration
//         const taxDeclaration = await TaxDeclaration.findOne({
//             employeeId,
//             financialYear: effectiveFY,
//         }).lean();
//         if (!taxDeclaration) {
//             throw new Error(`Tax Declaration not found for FY ${effectiveFY}`);
//         }
//         console.log(taxDeclaration, "taxDeclaration generateForm12BB");
//         // Map data to Form 12BB structure
//         const form12BBData = {
//             name: user.name,
//             pan: "",
//             fy: taxDeclaration.financialYear,
//             regime: taxDeclaration.regime.toUpperCase(),
//             claims: [
//                 {
//                     section: "House Rent Allowance",
//                     details: {
//                         rent_paid:
//                             taxDeclaration.declarations.find(
//                                 (d) => d.section === "80GG" && d.subSection === "rent_paid" && d.status === "verified"
//                             )?.verifiedAmount || 0,
//                         landlord_name: "",
//                         // taxDeclaration.declarations.find(
//                         //     (d) => d.section === "80GG" && d.subSection === "rent_paid"
//                         // )?.documents[0]?.landlordName || "Not Provided",
//                         landlord_address: "",
//                         // taxDeclaration.declarations.find(
//                         //     (d) => d.section === "80GG" && d.subSection === "rent_paid"
//                         // )?.documents[0]?.landlordAddress || "Not Provided",
//                         landlord_pan: "",
//                         // taxDeclaration.declarations.find(
//                         //     (d) => d.section === "80GG" && d.subSection === "rent_paid" && (d.verifiedAmount || 0) > 100000
//                         // )?.documents[0]?.landlordPan || "Not Provided",
//                         evidence:
//                             taxDeclaration.declarations.find(
//                                 (d) => d.section === "80GG" && d.subSection === "rent_paid"
//                             )?.documents[0]?.documentName || "Not Provided",
//                     },
//                 },
//                 {
//                     section: "Leave Travel Concession",
//                     details: {
//                         amount:
//                             taxDeclaration.declarations.find(
//                                 (d) => d.section === "10(5)" && d.subSection === "ltc" && d.status === "verified"
//                             )?.verifiedAmount || 0,
//                         evidence:
//                             taxDeclaration.declarations.find(
//                                 (d) => d.section === "10(5)" && d.subSection === "ltc"
//                             )?.documents[0]?.documentName || "Not Provided",
//                     },
//                 },
//                 {
//                     section: "Deduction of Interest on Borrowing",
//                     details: {
//                         interest_paid:
//                             taxDeclaration.declarations.find(
//                                 (d) => d.section === "24(b)" && d.subSection === "interest_paid" && d.status === "verified"
//                             )?.verifiedAmount || 0,
//                         lender_name: "",
//                         // taxDeclaration.declarations.find(
//                         //     (d) => d.section === "24(b)" && d.subSection === "interest_paid"
//                         // )?.documents[0]?.lenderName || "Not Provided",
//                         lender_address: "",
//                         // taxDeclaration.declarations.find(
//                         //     (d) => d.section === "24(b)" && d.subSection === "interest_paid"
//                         // )?.documents[0]?.lenderAddress || "Not Provided",
//                         lender_pan: "",
//                         // taxDeclaration.declarations.find(
//                         //     (d) => d.section === "24(b)" && d.subSection === "interest_paid"
//                         // )?.documents[0]?.lenderPan || "Not Provided",
//                         lender_type: "",
//                         // taxDeclaration.declarations.find(
//                         //     (d) => d.section === "24(b)" && d.subSection === "interest_paid"
//                         // )?.documents[0]?.lenderType || "Not Provided",
//                         evidence: ""
//                         // taxDeclaration.declarations.find(
//                         //     (d) => d.section === "24(b)" && d.subSection === "interest_paid"
//                         // )?.documents[0]?.documentName || "Not Provided",
//                     },
//                 },
//                 {
//                     section: "Chapter VI-A",
//                     subsections: [
//                         {
//                             name: "Section 80C",
//                             details: [
//                                 {
//                                     name: "Life Insurance Premium",
//                                     amount:
//                                         taxDeclaration.declarations.find(
//                                             (d) => d.section === "80C" && d.subSection === "life_insurance" && d.status === "verified"
//                                         )?.verifiedAmount || 0,
//                                     evidence:
//                                         taxDeclaration.declarations.find(
//                                             (d) => d.section === "80C" && d.subSection === "life_insurance"
//                                         )?.documents[0]?.documentName || "Not Provided",
//                                 },
//                                 {
//                                     name: "Employee Provident Fund (EPF)",
//                                     amount:
//                                         taxDeclaration.declarations.find(
//                                             (d) => d.section === "80C" && d.subSection === "epf" && d.status === "verified"
//                                         )?.verifiedAmount || 0,
//                                     evidence:
//                                         taxDeclaration.declarations.find(
//                                             (d) => d.section === "80C" && d.subSection === "epf"
//                                         )?.documents[0]?.documentName || "Not Provided",
//                                 },
//                                 {
//                                     name: "Public Provident Fund",
//                                     amount:
//                                         taxDeclaration.declarations.find(
//                                             (d) => d.section === "80C" && d.subSection === "ppf" && d.status === "verified"
//                                         )?.verifiedAmount || 0,
//                                     evidence:
//                                         taxDeclaration.declarations.find(
//                                             (d) => d.section === "80C" && d.subSection === "ppf"
//                                         )?.documents[0]?.documentName || "Not Provided",
//                                 },
//                             ],
//                         },
//                         {
//                             name: "Section 80CCC",
//                             details: [
//                                 {
//                                     name: "Pension Fund",
//                                     amount:
//                                         taxDeclaration.declarations.find(
//                                             (d) => d.section === "80CCC" && d.status === "verified"
//                                         )?.verifiedAmount || 0,
//                                     evidence:
//                                         taxDeclaration.declarations.find(
//                                             (d) => d.section === "80CCC"
//                                         )?.documents[0]?.documentName || "Not Provided",
//                                 },
//                             ],
//                         },
//                         {
//                             name: "Section 80CCD",
//                             details: [
//                                 {
//                                     name: "Employer's NPS Contribution",
//                                     amount:
//                                         taxDeclaration.declarations.find(
//                                             (d) => d.section === "80CCD2" && d.subSection === "employer_nps" && d.status === "verified"
//                                         )?.verifiedAmount || 0,
//                                     evidence:
//                                         taxDeclaration.declarations.find(
//                                             (d) => d.section === "80CCD2" && d.subSection === "employer_nps"
//                                         )?.documents[0]?.documentName || "Not Provided",
//                                 },
//                             ],
//                         },
//                         {
//                             name: "Other Sections",
//                             details: [
//                                 {
//                                     name: "Health Insurance for Self, Spouse, Children",
//                                     amount:
//                                         taxDeclaration.declarations.find(
//                                             (d) => d.section === "80D" && d.subSection === "self_family" && d.status === "verified"
//                                         )?.verifiedAmount || 0,
//                                     evidence:
//                                         taxDeclaration.declarations.find(
//                                             (d) => d.section === "80D" && d.subSection === "self_family"
//                                         )?.documents[0]?.documentName || "Not Provided",
//                                 },
//                                 {
//                                     name: "Health Insurance for Parents",
//                                     amount:
//                                         taxDeclaration.declarations.find(
//                                             (d) => d.section === "80D" && d.subSection === "parents" && d.status === "verified"
//                                         )?.verifiedAmount || 0,
//                                     evidence:
//                                         taxDeclaration.declarations.find(
//                                             (d) => d.section === "80D" && d.subSection === "parents"
//                                         )?.documents[0]?.documentName || "Not Provided",
//                                 },
//                                 {
//                                     name: "Rent Paid",
//                                     amount:
//                                         taxDeclaration.declarations.find(
//                                             (d) => d.section === "80GG" && d.subSection === "rent_paid" && d.status === "verified"
//                                         )?.verifiedAmount || 0,
//                                     evidence:
//                                         taxDeclaration.declarations.find(
//                                             (d) => d.section === "80GG" && d.subSection === "rent_paid"
//                                         )?.documents[0]?.documentName || "Not Provided",
//                                 },
//                                 {
//                                     name: "Interest on Deposits (80TTA)",
//                                     amount:
//                                         taxDeclaration.declarations.find(
//                                             (d) => d.section === "80TTA" && d.status === "verified"
//                                         )?.verifiedAmount || 0,
//                                     evidence:
//                                         taxDeclaration.declarations.find(
//                                             (d) => d.section === "80TTA"
//                                         )?.documents[0]?.documentName || "Not Provided",
//                                 },
//                             ],
//                         },
//                     ],
//                 },
//             ],
//             other_income:
//                 taxDeclaration.declarations.find(
//                     (d) => d.section === "other_income" && d.status === "verified"
//                 )?.verifiedAmount || 0,
//             processedTDS: taxDeclaration.taxPaid || 0,
//             verification: {
//                 employee_name: user.name || "-",
//                 father_name: "",
//                 place: user.address?.split(",")[1]?.trim() || "Not Provided",
//                 date: new Date().toISOString().split("T")[0],
//                 signature: user.name || "-",
//             },
//         };


//         console.log(JSON.stringify(form12BBData, null, 2), "form12BBData JSON");
//         console.log("first")
//         const flattenedData = {
//             ...form12BBData,
//             rent_paid: form12BBData.claims?.[0]?.details?.rent_paid || 0,
//             landlord_name: form12BBData.claims?.[0]?.details?.landlord_name || "",
//             landlord_address: form12BBData.claims?.[0]?.details?.landlord_address || "",
//             landlord_pan: form12BBData.claims?.[0]?.details?.landlord_pan || "",
//             ltc_amount: form12BBData.claims?.[1]?.details?.amount || 0,
//             interest_paid: form12BBData.claims?.[2]?.details?.interest_paid || 0,
//             lender_name: form12BBData.claims?.[2]?.details?.lender_name || "",
//             lender_address: form12BBData.claims?.[2]?.details?.lender_address || "",
//             lender_pan: form12BBData.claims?.[2]?.details?.lender_pan || "",
//             lender_type: form12BBData.claims?.[2]?.details?.lender_type || "",
//             processedTDS: form12BBData.processedTDS || 0,
//             other_income: form12BBData.other_income || 0,
//             section_80C: form12BBData.claims?.[3]?.subsections?.[0]?.details || [],
//             section_80CCC: form12BBData.claims?.[3]?.subsections?.[1]?.details || [],
//             section_80CCD: form12BBData.claims?.[3]?.subsections?.[2]?.details || [],
//             section_other: form12BBData.claims?.[3]?.subsections?.[3]?.details || [],
//         };
//         console.log(flattenedData, "flattenedData generateForm12BB")
//         console.log(JSON.stringify(flattenedData, null, 2), "flattenedData JSON");
//         // Define paths for input template and output files
//         const form12BBDir = path.join(process.cwd(), 'uploads');
//         console.log(form12BBDir, "1 form12BBDir")
//         // // Create payslips directory if it doesn't exist
//         if (!fs.existsSync("uploads")) {
//             fs.mkdirSync("uploads", { recursive: true });
//         }
//         const form12BBBaseName = `form12bb_${employeeId}_${effectiveFY.replace("-", "_")}`;
//         const outputDocxPath = path.join(form12BBDir, `${form12BBBaseName}.docx`);
//         const outputPdfPath = path.join(form12BBDir, `${form12BBBaseName}.pdf`);
//         try {
//             console.log(outputDocxPath, outputPdfPath, "outputDocxPath outputPdfPath")
//             // Replace placeholders in DOCX template
//             await this.replacePlaceholdersInDocx(
//                 path.join(process.cwd(), "form12bb_template.docx"),
//                 outputDocxPath,
//                 flattenedData

//             );
//             // Convert DOCX to PDF
//             await this.convertDocxToPDF(outputDocxPath, outputPdfPath);

//             // Upload to GCP Cloud Storage
//             const gcpResult = await uploadFileToGCP({
//                 filePath: outputPdfPath,
//                 fileName: `${form12BBBaseName}.pdf`,
//                 employeeId: employeeId,
//                 category: 'Tax',
//                 type: 'Form12BB'
//             });

//             if (!gcpResult.success) {
//                 throw new Error(`Failed to upload Form12BB to GCP: ${gcpResult.error}`);
//             }

//             const fileUrl = gcpResult.fileUrl!;
//             console.log(fileUrl, "fileUrl generateForm12BB")

//             // Clean up temp files
//             try {
//                 await fsPromises.unlink(outputDocxPath);
//                 await fsPromises.unlink(outputPdfPath);
//             } catch (err) {
//                 console.warn(`Failed to delete temp files:`, err);
//             }

//             const existingDoc = await Document.findOne({
//                 employeeId: new Types.ObjectId(employeeId),
//                 type: 'Form12BB',
//                 'metadata.form12BB.financialYear': effectiveFY
//             });
//             console.log(existingDoc, "existingDoc generateForm12BB")
//             const documentData = {
//                 fileName: `${form12BBBaseName}.pdf`,
//                 filePath: fileUrl,
//                 status: 'Generated',
//                 uploadDate: new Date(),
//                 uploadedBy: new Types.ObjectId(this.context.user?._id),
//                 accessLevel: 'Private',
//                 tags: ['Form12BB', effectiveFY],
//                 category: 'Tax',
//                 type: 'Form12BB',
//                 metadata: {
//                     form12BB: {
//                         financialYear: effectiveFY,
//                         regime: taxDeclaration.regime,
//                         taxDeclarationId: taxDeclaration._id,
//                         totalIncome: taxDeclaration.annualGross,
//                         deductions: taxDeclaration.totalDeclaredAmount,
//                         taxPayable: taxDeclaration.initialTaxBreakdown?.finalTaxWithCess,
//                         isLocked: false,
//                         isPreviewEnabled: false,
//                         tdsPaid: taxDeclaration.taxPaid
//                     }
//                 }
//             };

//             let document: IDocument;

//             if (existingDoc) {
//                 // Update existing document
//                 Object.assign(existingDoc, documentData);
//                 if (!existingDoc.auditLog) {
//                     existingDoc.auditLog = [];
//                 }
//                 existingDoc.auditLog.push({
//                     action: 'Re-Generate',
//                     performedBy: new Types.ObjectId(this.context.user?._id),
//                     timestamp: new Date(),
//                     details: `Form 12BB re-generated for ${user.name} for FY ${effectiveFY}`
//                 });
//                 await existingDoc.save();
//                 console.log("Form 12BB document updated successfully:", existingDoc._id);
//                 document = existingDoc;
//             } else {
//                 // Create new document
//                 document = new Document({
//                     ...documentData,
//                     employeeId: new Types.ObjectId(employeeId),
//                     auditLog: [{
//                         action: 'Upload',
//                         performedBy: new Types.ObjectId(this.context.user?._id),
//                         timestamp: new Date(),
//                         details: `Form 12BB generated for ${user.name} for FY ${effectiveFY}`
//                     }]
//                 });
//                 await document.save();
//                 console.log("Form 12BB document created successfully:", document._id);
//             }

//             console.log("Form 12BB document saved successfully:", document._id);
//             return document;
//         } catch (error: any) {
//             console.error("Form 12BB Generation Error:", error);
//             throw new Error(`Failed to generate Form 12BB for ${user.name}: ${error.message}`);
//         }
//     }

//     //Form12BB preview update
//     async updateForm12BBPreview(documentId: string, isPreviewEnabled: boolean, user: Partial<IUser>): Promise<IDocument> {
//         const document = await Document.findById(documentId);
//         if (!document || document.type !== "Form12BB") {
//             throw new Error("Document not found or not a Form 12BB");
//         }

//         if (!document.metadata.form12BB) {
//             throw new Error("Form12BB metadata is missing");
//         }
//         document.metadata.form12BB.isPreviewEnabled = isPreviewEnabled;
//         document.updatedBy = new Types.ObjectId(user._id); // Track the user who updated
//         if (!document.auditLog) {
//             document.auditLog = [];
//         }
//         document.auditLog.push({
//             action: "Update",
//             performedBy: new Types.ObjectId(user._id),
//             timestamp: new Date(),
//             details: `Preview status changed to ${isPreviewEnabled} for Form 12BB by ${user.name || "unknown"}`,
//         });
//         document.markModified("metadata.form12BB"); // Ensure Mongoose tracks changes
//         document.markModified("auditLog"); // Ensure audit log is tracked

//         return await document.save();
//     }

//     //method not used 

//     /**
//   * Get document by ID with audit trail
//   */
//     async getDocumentById(documentId: string, userId: string): Promise<any> {
//         const document = await Document.findById(documentId)
//             .populate('employeeId', 'name email')
//             .populate('uploadedBy', 'name');

//         if (!document || document.type) {
//             throw new Error('Document not found');
//         }

//         // Add view audit log
//         await Document.findByIdAndUpdate(documentId, {
//             $push: {
//                 auditLog: {
//                     action: 'View',
//                     performedBy: new Types.ObjectId(userId),
//                     details: `${document.type} document accessed`
//                 }
//             }
//         });

//         return document;
//     }

//     /**
//    * Download payslip document
//    */
//     async downloadPayslipDocument(documentId: string, userId: string): Promise<string> {
//         const document = await this.getDocumentById(documentId, userId);

//         // Add download audit log
//         await Document.findByIdAndUpdate(documentId, {
//             $push: {
//                 auditLog: {
//                     action: 'Download',
//                     performedBy: new Types.ObjectId(userId),
//                     details: 'Payslip document downloaded'
//                 }
//             }
//         });

//         return document.filePath;
//     }

//     /**
//    * Get payslip documents by date range
//    */
//     async getPayslipDocumentsByDateRange(
//         startMonth: number,
//         startYear: number,
//         endMonth: number,
//         endYear: number,
//         employeeIds?: string[]
//     ): Promise<any[]> {
//         const filter: any = {
//             type: 'Payslip',
//             $or: [
//                 {
//                     'metadata.payslip.year': { $gt: startYear, $lt: endYear }
//                 },
//                 {
//                     'metadata.payslip.year': startYear,
//                     'metadata.payslip.month': { $gte: startMonth }
//                 },
//                 {
//                     'metadata.payslip.year': endYear,
//                     'metadata.payslip.month': { $lte: endMonth }
//                 }
//             ]
//         };

//         if (employeeIds && employeeIds.length > 0) {
//             filter.employeeId = { $in: employeeIds.map(id => new Types.ObjectId(id)) };
//         }

//         return await Document.find(filter)
//             .populate('employeeId', 'name email')
//             .sort({ 'metadata.payslip.year': -1, 'metadata.payslip.month': -1 });
//     }

//     /**
//      * Admin Upload Document - Simple upload for payslips, timesheets, etc.
//      * This is a simplified version for manual admin uploads without complex validation
//      */
//     async adminUploadDocument(
//         employeeId: string,
//         documentType: 'Payslip' | 'Timesheet' | 'Other',
//         documentName: string,
//         documentDate: Date,
//         uploadedFile: any,
//         description?: string
//     ): Promise<IDocument> {
//         // Validate employee exists
//         const employee = await User.findById(employeeId);
//         if (!employee) {
//             throw new Error(`Employee with ID ${employeeId} not found`);
//         }

//         // Determine category based on document type
//         let category: 'Payroll' | 'Timesheet' | 'Tax' | 'EmployeeLifecycle' | 'Certification';
//         switch (documentType) {
//             case 'Payslip':
//                 category = 'Payroll';
//                 break;
//             case 'Timesheet':
//                 category = 'Timesheet';
//                 break;
//             default:
//                 category = 'EmployeeLifecycle';
//         }

//         // Generate filename from documentName
//         const cleanDocName = documentName.replace(/[^a-zA-Z0-9_\s-]/g, '_').trim();
//         const originalExtension = path.extname(uploadedFile.filename);
//         const newFileName = `${cleanDocName}${originalExtension}`;

//         // Save file to temp location first
//         const uploadsDir = path.resolve(__dirname, '..', '..', 'uploads');
//         await fsPromises.mkdir(uploadsDir, { recursive: true });
//         const tempFilePath = path.join(uploadsDir, newFileName);

//         // Write file buffer to disk
//         const buffer = await uploadedFile.toBuffer();
//         await fsPromises.writeFile(tempFilePath, buffer);

//         // Upload file to GCP Cloud Storage
//         const gcpResult = await uploadFileToGCP({
//             filePath: tempFilePath,
//             fileName: newFileName,
//             employeeId: employeeId,
//             category: category,
//             type: 'AdminUpload'
//         });

//         if (!gcpResult.success) {
//             throw new Error(`Failed to upload file to GCP: ${gcpResult.error}`);
//         }

//         const fileUrl = gcpResult.fileUrl!;

//         // Clean up temp file
//         try {
//             await fsPromises.unlink(tempFilePath);
//         } catch (err) {
//             console.error('Error deleting temp file:', err);
//         }

//         // Extract month and year from documentDate for tags
//         const docDate = new Date(documentDate);
//         const month = docDate.getMonth() + 1;
//         const year = docDate.getFullYear();

//         // Create document record
//         const newDocument = new Document({
//             employeeId: new Types.ObjectId(employeeId),
//             type: 'AdminUpload',
//             category: category,
//             tags: [documentType, `${year}`, monthNames[month - 1]],
//             fileName: newFileName,
//             filePath: fileUrl,
//             accessLevel: 'Private',
//             status: 'Uploaded',
//             uploadedBy: new Types.ObjectId(this.context.user?._id),
//             metadata: {
//                 adminUpload: {
//                     documentType: documentType,
//                     documentName: documentName,
//                     documentDate: docDate,
//                     description: description,
//                     uploadedAt: new Date()
//                 }
//             },
//             auditLog: [
//                 {
//                     action: 'Upload',
//                     performedBy: new Types.ObjectId(this.context.user?._id),
//                     timestamp: new Date(),
//                     details: `Admin uploaded ${documentType} document: "${documentName}" for ${employee.name}`
//                 }
//             ]
//         });

//         await newDocument.save();
//         return newDocument;
//     }

//     /**
//      * Admin Upload Payslip - Upload payslip for employee using same structure as generated payslips
//      * This creates a Payslip document (not AdminUpload) with the same metadata structure
//      */
//     async adminUploadPayslip(
//         employeeId: string,
//         month: number,
//         year: number,
//         uploadedFile: any,
//         netSalary?: number,
//         isExport: boolean = true
//     ): Promise<IDocument> {
//         // Validate employee exists
//         const employee = await User.findById(employeeId);
//         if (!employee) {
//             throw new Error(`Employee with ID ${employeeId} not found`);
//         }

//         // Validate month and year
//         if (month < 1 || month > 12) {
//             throw new Error('Invalid month. Month must be between 1 and 12.');
//         }
//         if (year < 2000 || year > 2100) {
//             throw new Error('Invalid year. Year must be between 2000 and 2100.');
//         }

//         // Check if payslip already exists for this month/year
//         const existingDocument = await Document.findOne({
//             employeeId: new Types.ObjectId(employeeId),
//             type: 'Payslip',
//             'metadata.payslip.month': month,
//             'metadata.payslip.year': year,
//         });

//         // Generate filename
//         const monthStr = month <= 9 ? `0${month}` : `${month}`;
//         const cleanName = employee.name.replace(/[^a-zA-Z0-9]/g, '_');
//         const originalExtension = path.extname(uploadedFile.filename);
//         const filename = `Doc_Payslip_${employee._id.toString().slice(-5)}_${cleanName}_${year}_${monthStr}${originalExtension}`;

//         // Save file to temp location first
//         const uploadsDir = path.resolve(__dirname, '..', '..', 'uploads');
//         await fsPromises.mkdir(uploadsDir, { recursive: true });
//         const tempFilePath = path.join(uploadsDir, filename);

//         // Write file buffer to disk
//         let buffer: Buffer;
//         try {
//             buffer = await uploadedFile.toBuffer();
//         } catch (err) {
//             throw new Error(`Failed to read uploaded file: ${err instanceof Error ? err.message : 'Unknown error'}`);
//         }

//         try {
//             await fsPromises.writeFile(tempFilePath, buffer);
//         } catch (err) {
//             throw new Error(`Failed to save file temporarily: ${err instanceof Error ? err.message : 'Unknown error'}`);
//         }

//         // Upload file to GCP Cloud Storage
//         const gcpResult = await uploadFileToGCP({
//             filePath: tempFilePath,
//             fileName: filename,
//             employeeId: employeeId,
//             category: 'Payroll',
//             type: 'Payslip'
//         });

//         if (!gcpResult.success) {
//             // Clean up temp file before throwing error
//             try {
//                 await fsPromises.unlink(tempFilePath);
//             } catch (cleanupErr) {
//                 console.error('Error cleaning up temp file after GCP failure:', cleanupErr);
//             }
//             throw new Error(`Failed to upload file to GCP: ${gcpResult.error}`);
//         }

//         if (!gcpResult.fileUrl) {
//             // Clean up temp file before throwing error
//             try {
//                 await fsPromises.unlink(tempFilePath);
//             } catch (cleanupErr) {
//                 console.error('Error cleaning up temp file after GCP failure:', cleanupErr);
//             }
//             throw new Error('GCP upload succeeded but no file URL returned');
//         }

//         const fileUrl = gcpResult.fileUrl;

//         // Clean up temp file
//         try {
//             await fsPromises.unlink(tempFilePath);
//         } catch (err) {
//             console.error('Error deleting temp file:', err);
//         }

//         // Prepare document data with same structure as generated payslips
//         const documentData = {
//             employeeId: new Types.ObjectId(employeeId),
//             type: 'Payslip' as const,
//             category: 'Payroll' as const,
//             fileName: filename,
//             filePath: fileUrl,
//             tags: ['Payslip', `${year}`, `month-${month}`],
//             uploadDate: new Date(),
//             uploadedBy: new Types.ObjectId(this.context.user?._id || employeeId),
//             version: existingDocument ? existingDocument.version + 1 : 1,
//             accessLevel: 'Private' as const,
//             status: 'Uploaded' as const, // Manual uploads have status 'Uploaded'
//             metadata: {
//                 payslip: {
//                     payrollId: null, // No payrollId for manually uploaded payslips
//                     monthYear: `${year}-${monthStr}`,
//                     month,
//                     year,
//                     netSalary: netSalary || 0,
//                     paySummary: {
//                         gross: 0,
//                         net: netSalary || 0,
//                         deductions: 0,
//                         bonus: 0,
//                         reimbursement: 0,
//                     },
//                     presentDays: 0,
//                     totalDays: 0,
//                     payableDays: 0,
//                     isExport,
//                 },
//             },
//             auditLog: [
//                 {
//                     action: 'Upload' as const,
//                     performedBy: new Types.ObjectId(this.context.user?._id || employeeId),
//                     timestamp: new Date(),
//                     details: `Admin uploaded payslip for ${employee.name} for ${month}-${year}`,
//                 },
//             ],
//         };

//         if (existingDocument) {
//             // Delete old file from GCP (non-blocking - don't fail if this fails)
//             if (existingDocument.filePath) {
//                 try {
//                     await deleteFileFromGCP(existingDocument.filePath);
//                 } catch (err) {
//                     console.warn(`Failed to delete old file from GCP: ${existingDocument.filePath}`, err);
//                     // Continue with update even if old file deletion fails
//                 }
//             }

//             // Preserve existing audit log and append new entry
//             const existingAuditLog = existingDocument.auditLog || [];
//             documentData.auditLog = [
//                 ...(existingAuditLog as any[]),
//                 ...documentData.auditLog
//             ];

//             Object.assign(existingDocument, documentData);

//             try {
//                 await existingDocument.save();
//                 return existingDocument;
//             } catch (err) {
//                 // If save fails, try to clean up the new GCP file
//                 try {
//                     await deleteFileFromGCP(fileUrl);
//                 } catch (cleanupErr) {
//                     console.error('Error cleaning up GCP file after save failure:', cleanupErr);
//                 }
//                 throw new Error(`Failed to update existing payslip: ${err instanceof Error ? err.message : 'Unknown error'}`);
//             }
//         } else {
//             const newDocument = new Document(documentData);
//             try {
//                 await newDocument.save();
//                 return newDocument;
//             } catch (err) {
//                 // If save fails, try to clean up the GCP file
//                 try {
//                     await deleteFileFromGCP(fileUrl);
//                 } catch (cleanupErr) {
//                     console.error('Error cleaning up GCP file after save failure:', cleanupErr);
//                 }
//                 throw new Error(`Failed to save payslip document: ${err instanceof Error ? err.message : 'Unknown error'}`);
//             }
//         }
//     }

//     /**
//      * Validate payslip file before upload
//      */
//     private async validatePayslipFile(file: any, month: number): Promise<void> {
//         // Validate file exists
//         if (!file) {
//             throw new Error(`No file provided for month ${month}`);
//         }

//         // Validate file type
//         const allowedExtensions = ['.pdf', '.docx', '.doc'];
//         const fileExt = path.extname(file.filename).toLowerCase();
//         if (!allowedExtensions.includes(fileExt)) {
//             throw new Error(`Invalid file type for month ${month}. Allowed: ${allowedExtensions.join(', ')}`);
//         }

//         // Validate file size (max 10MB)
//         const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
//         try {
//             const buffer = await file.toBuffer();
//             if (buffer.length > MAX_FILE_SIZE) {
//                 throw new Error(`File for month ${month} exceeds maximum size of 10MB`);
//             }
//             if (buffer.length === 0) {
//                 throw new Error(`File for month ${month} is empty`);
//             }
//         } catch (err) {
//             if (err instanceof Error && (err.message.includes('exceeds') || err.message.includes('empty'))) {
//                 throw err;
//             }
//             throw new Error(`Failed to read file for month ${month}: ${err instanceof Error ? err.message : 'Unknown error'}`);
//         }
//     }

//     /**
//      * Admin Upload Payslips For Year - Upload multiple payslips for a full year
//      * Validates months based on employee's joining date
//      * Handles partial success (some months can succeed even if others fail)
//      */
//     async adminUploadPayslipsForYear(
//         employeeId: string,
//         year: number,
//         filesMap: Map<number, { file: any; netSalary?: number }>,
//         isExport: boolean = true
//     ): Promise<{
//         success: number;
//         failed: number;
//         payslips: Array<{
//             month: number;
//             documentId: string;
//             fileName: string;
//             filePath: string;
//             status: string;
//         }>;
//         errors: Array<{
//             month: number;
//             error: string;
//         }>;
//     }> {
//         // Validate employee exists and is active
//         const employee = await User.findById(employeeId);
//         if (!employee) {
//             throw new Error(`Employee with ID ${employeeId} not found`);
//         }

//         if (!employee.active) {
//             throw new Error(`Employee ${employee.name} is not active`);
//         }

//         // Validate joining date exists
//         if (!employee.joiningDate) {
//             throw new Error(`Employee ${employee.name} does not have a joining date`);
//         }

//         // Validate year
//         if (year < 2000 || year > 2100) {
//             throw new Error('Invalid year. Year must be between 2000 and 2100.');
//         }

//         // Calculate valid months based on joining date
//         const joiningDate = new Date(employee.joiningDate);
//         const joiningYear = joiningDate.getFullYear();
//         const joiningMonth = joiningDate.getMonth() + 1; // JavaScript months are 0-based

//         let validMonths: number[] = [];
//         if (year === joiningYear) {
//             // Same year: can only upload from joining month onwards
//             validMonths = Array.from({ length: 12 - joiningMonth + 1 }, (_, i) => joiningMonth + i);
//         } else if (year > joiningYear) {
//             // Future year: can upload all 12 months
//             validMonths = Array.from({ length: 12 }, (_, i) => i + 1);
//         } else {
//             // Past year: invalid (employee not joined yet)
//             throw new Error(`Cannot upload payslips for year ${year}. Employee joined on ${joiningDate.toISOString().split('T')[0]} (year ${joiningYear})`);
//         }

//         // Validate filesMap has at least 1 entry, max 12
//         if (filesMap.size === 0) {
//             throw new Error('No files provided. Expected at least 1 file.');
//         }

//         if (filesMap.size > 12) {
//             throw new Error(`Too many files. Maximum 12 files allowed (one per month). Found: ${filesMap.size}`);
//         }

//         // Validate all uploaded months are valid
//         const uploadedMonths = Array.from(filesMap.keys());
//         const invalidMonths = uploadedMonths.filter(month => !validMonths.includes(month));

//         if (invalidMonths.length > 0) {
//             const invalidMonthNames = invalidMonths.map(m => monthNames[m - 1]).join(', ');
//             const validMonthNames = validMonths.map(m => monthNames[m - 1]).join(', ');
//             throw new Error(
//                 `Cannot upload payslips for months: ${invalidMonthNames}. ` +
//                 `Employee joined on ${joiningDate.toISOString().split('T')[0]} (${monthNames[joiningMonth - 1]} ${joiningYear}). ` +
//                 `Valid months for ${year}: ${validMonthNames}`
//             );
//         }

//         // Validate no duplicate months
//         const monthSet = new Set(uploadedMonths);
//         if (monthSet.size !== uploadedMonths.length) {
//             throw new Error('Duplicate months found. Each month can only be uploaded once.');
//         }

//         // Process each month sequentially
//         const results = {
//             success: 0,
//             failed: 0,
//             payslips: [] as Array<{
//                 month: number;
//                 documentId: string;
//                 fileName: string;
//                 filePath: string;
//                 status: string;
//             }>,
//             errors: [] as Array<{
//                 month: number;
//                 error: string;
//             }>
//         };

//         // Sort months to process in order
//         const sortedMonths = Array.from(filesMap.keys()).sort((a, b) => a - b);

//         for (const month of sortedMonths) {
//             const { file, netSalary } = filesMap.get(month)!;

//             try {
//                 // Validate file for this month
//                 await this.validatePayslipFile(file, month);

//                 // Upload using existing method
//                 const document = await this.adminUploadPayslip(
//                     employeeId,
//                     month,
//                     year,
//                     file,
//                     netSalary,
//                     isExport
//                 );

//                 results.success++;
//                 results.payslips.push({
//                     month,
//                     documentId: document._id.toString(),
//                     fileName: document.fileName,
//                     filePath: document.filePath,
//                     status: document.status
//                 });

//                 console.log(`[INFO] Month ${month} (${monthNames[month - 1]}) uploaded successfully: documentId=${document._id}`);
//             } catch (error) {
//                 results.failed++;
//                 const errorMessage = error instanceof Error ? error.message : String(error);
//                 results.errors.push({
//                     month,
//                     error: errorMessage
//                 });
//                 console.warn(`[WARN] Month ${month} (${monthNames[month - 1]}) upload failed: ${errorMessage}`);
//                 // Continue to next month
//             }
//         }

//         console.log(`[INFO] Bulk payslip upload completed: employeeId=${employeeId}, year=${year}, success=${results.success}, failed=${results.failed}`);

//         return results;
//     }

//     /**
//      * Get admin uploaded documents with filters
//      */
//     async getAdminUploadedDocuments(filters: {
//         employeeId?: string;
//         documentType?: 'Payslip' | 'Timesheet' | 'Other';
//         startDate?: Date;
//         endDate?: Date;
//         page?: number;
//         limit?: number;
//     }): Promise<{ documents: IDocument[]; total: number; page: number; totalPages: number }> {
//         const { employeeId, documentType, startDate, endDate, page = 1, limit = 10 } = filters;

//         const query: any = { type: 'AdminUpload' };

//         if (employeeId) {
//             query.employeeId = new Types.ObjectId(employeeId);
//         }

//         if (documentType) {
//             query['metadata.adminUpload.documentType'] = documentType;
//         }

//         if (startDate || endDate) {
//             query['metadata.adminUpload.documentDate'] = {};
//             if (startDate) {
//                 query['metadata.adminUpload.documentDate'].$gte = new Date(startDate);
//             }
//             if (endDate) {
//                 query['metadata.adminUpload.documentDate'].$lte = new Date(endDate);
//             }
//         }

//         const skip = (page - 1) * limit;
//         const total = await Document.countDocuments(query);
//         const documents = await Document.find(query)
//             .populate('employeeId', 'name email employeeId')
//             .populate('uploadedBy', 'name email')
//             .sort({ 'metadata.adminUpload.documentDate': -1 })
//             .skip(skip)
//             .limit(limit);

//         return {
//             documents,
//             total,
//             page,
//             totalPages: Math.ceil(total / limit)
//         };
//     }

//     /**
//      * Get document by ID (without population)
//      */
//     async getDocumentByIdRaw(documentId: string): Promise<IDocument> {
//         const document = await Document.findById(documentId);
//         if (!document) {
//             throw new Error('Document not found');
//         }
//         return document;
//     }

//     /**
//      * Update admin uploaded document
//      */
//     async updateAdminDocument(
//         documentId: string,
//         updateData: {
//             documentType: "Payslip" | "Timesheet" | "Other";
//             documentDate: string;
//             documentName: string;
//             description?: string;
//         }
//     ): Promise<IDocument> {
//         const { documentType, documentDate, documentName, description } = updateData;

//         console.log('🔧 [UPDATE DEBUG] Input data:', {
//             documentId,
//             documentType,
//             documentDate,
//             documentName,
//             description,
//             descriptionType: typeof description
//         });

//         // Find the document
//         const document = await Document.findOne({
//             _id: new Types.ObjectId(documentId),
//             type: 'AdminUpload'
//         });

//         if (!document) {
//             throw new Error('Document not found');
//         }

//         // Update metadata
//         if (!document.metadata) {
//             document.metadata = {};
//         }

//         console.log('🔧 [UPDATE DEBUG] Before update - current metadata:', JSON.stringify(document.metadata, null, 2));

//         if (!document.metadata.adminUpload) {
//             document.metadata.adminUpload = {
//                 documentType: documentType,
//                 documentName: documentName,
//                 documentDate: new Date(documentDate),
//                 description: description || '',
//                 uploadedAt: new Date()
//             };
//             console.log('🔧 [UPDATE DEBUG] Created new adminUpload metadata');
//         } else {
//             // Update the admin upload metadata
//             console.log('🔧 [UPDATE DEBUG] Updating existing adminUpload metadata');
//             console.log('🔧 [UPDATE DEBUG] Old description:', document.metadata.adminUpload.description);
//             console.log('🔧 [UPDATE DEBUG] New description:', description);

//             document.metadata.adminUpload.documentType = documentType;
//             document.metadata.adminUpload.documentName = documentName;
//             document.metadata.adminUpload.documentDate = new Date(documentDate);

//             // Always update description - use empty string if not provided
//             document.metadata.adminUpload.description = description || '';

//             console.log('🔧 [UPDATE DEBUG] After update - description:', document.metadata.adminUpload.description);

//             // Preserve the original uploadedAt timestamp if it exists
//             if (!document.metadata.adminUpload.uploadedAt) {
//                 document.metadata.adminUpload.uploadedAt = new Date();
//             }
//         }

//         console.log('🔧 [UPDATE DEBUG] After update - full metadata:', JSON.stringify(document.metadata, null, 2));

//         // Mark the metadata field as modified so Mongoose saves it
//         document.markModified('metadata');
//         console.log('🔧 [UPDATE DEBUG] Marked metadata as modified');

//         // Update tags based on document type and date
//         const date = new Date(documentDate);
//         const year = date.getFullYear().toString();
//         const month = date.toLocaleString('default', { month: 'long' });

//         document.tags = [documentType, year, month];

//         // Add audit log entry
//         const auditEntry = {
//             action: 'Update' as const,
//             performedBy: new Types.ObjectId(this.context.user?._id),
//             timestamp: new Date(),
//             details: `Admin updated ${documentType} document: "${documentName}"`
//         };

//         if (!document.auditLog) {
//             document.auditLog = [];
//         }
//         document.auditLog.push(auditEntry);

//         // Save the updated document
//         console.log('🔧 [UPDATE DEBUG] Saving document...');
//         await document.save();
//         console.log('🔧 [UPDATE DEBUG] Document saved successfully');

//         // Populate and return the updated document
//         const updatedDocument = await Document.findById(documentId)
//             .populate('employeeId', 'name email employeeId')
//             .populate('uploadedBy', 'name email');

//         if (!updatedDocument) {
//             throw new Error('Failed to retrieve updated document');
//         }

//         // Debug logging
//         console.log('🔧 [UPDATE DEBUG] Final updated document metadata:', JSON.stringify(updatedDocument.metadata, null, 2));
//         console.log('🔧 [UPDATE DEBUG] Final description value:', updatedDocument.metadata?.adminUpload?.description);

//         return updatedDocument;
//     }

//     /**
//      * Update admin uploaded document with new file
//      */
//     async updateAdminDocumentWithFile(
//         documentId: string,
//         updateData: {
//             file: any;
//             documentType: "Payslip" | "Timesheet" | "Other";
//             documentDate: string;
//             documentName: string;
//             description?: string;
//             employeeId: string;
//         }
//     ): Promise<IDocument> {
//         const { file, documentType, documentDate, documentName, description, employeeId } = updateData;

//         // Find the existing document
//         const existingDocument = await Document.findOne({
//             _id: new Types.ObjectId(documentId),
//             type: 'AdminUpload'
//         });

//         if (!existingDocument) {
//             throw new Error('Document not found');
//         }

//         // Get employee details
//         const employee = await User.findById(new Types.ObjectId(employeeId));
//         if (!employee) {
//             throw new Error('Employee not found');
//         }

//         // Generate new file path (similar to upload logic)
//         const timestamp = Date.now();
//         const sanitizedFileName = file.filename.replace(/[^a-zA-Z0-9.-]/g, '_');
//         const newFileName = `${timestamp}_${sanitizedFileName}`;
//         const filePath = `https://storage.googleapis.com/${config.GCP_STORAGE_BUCKET}/${employeeId}/Payroll/${newFileName}`;

//         // Update document with new file information
//         existingDocument.fileName = newFileName;
//         existingDocument.filePath = filePath;
//         existingDocument.version = (existingDocument.version || 1) + 1;

//         // Update metadata
//         if (!existingDocument.metadata) {
//             existingDocument.metadata = {};
//         }

//         if (!existingDocument.metadata.adminUpload) {
//             existingDocument.metadata.adminUpload = {
//                 documentType: documentType,
//                 documentName: documentName,
//                 documentDate: new Date(documentDate),
//                 description: description || '',
//                 uploadedAt: new Date()
//             };
//         } else {
//             // Update the admin upload metadata
//             existingDocument.metadata.adminUpload.documentType = documentType;
//             existingDocument.metadata.adminUpload.documentName = documentName;
//             existingDocument.metadata.adminUpload.documentDate = new Date(documentDate);
//             if (description !== undefined) {
//                 existingDocument.metadata.adminUpload.description = description;
//             }
//             // Keep original uploadedAt, but update the file upload timestamp
//             existingDocument.metadata.adminUpload.uploadedAt = new Date();
//         }

//         // Update tags based on document type and date
//         const date = new Date(documentDate);
//         const year = date.getFullYear().toString();
//         const month = date.toLocaleString('default', { month: 'long' });

//         existingDocument.tags = [documentType, year, month];

//         // Add audit log entry
//         const auditEntry = {
//             action: 'Re-upload' as const,
//             performedBy: new Types.ObjectId(this.context.user?._id),
//             timestamp: new Date(),
//             details: `Admin re-uploaded ${documentType} document: "${documentName}" for ${employee.name}`
//         };

//         if (!existingDocument.auditLog) {
//             existingDocument.auditLog = [];
//         }
//         existingDocument.auditLog.push(auditEntry);

//         // Save the updated document
//         await existingDocument.save();

//         // Populate and return the updated document
//         const updatedDocument = await Document.findById(documentId)
//             .populate('employeeId', 'name email employeeId')
//             .populate('uploadedBy', 'name email');

//         if (!updatedDocument) {
//             throw new Error('Failed to retrieve updated document');
//         }

//         return updatedDocument;
//     }

//     // Upload Attendance File (Admin Only)
//     async uploadAttendanceFile(
//         file: any,
//         documentName: string,
//         year: number,
//         description: string | undefined,
//         targetEmployeeId: Types.ObjectId,  // The employee this file belongs to
//         uploadedBy: Types.ObjectId          // The admin who uploaded
//     ): Promise<IDocument> {
//         try {
//             // Validate file type (only Excel and PDF allowed)
//             const allowedExtensions = ['.xlsx', '.xls', '.pdf'];
//             const fileExtension = path.extname(file.originalname).toLowerCase();

//             if (!allowedExtensions.includes(fileExtension)) {
//                 throw new Error('Invalid file type. Only Excel (.xlsx, .xls) and PDF files are allowed.');
//             }

//             // Validate year
//             const currentYear = new Date().getFullYear();
//             if (year < 2020 || year > currentYear + 1) {
//                 throw new Error(`Invalid year. Year must be between 2020 and ${currentYear + 1}.`);
//             }

//             // Create uploads directory
//             const uploadsDir = path.resolve(__dirname, '..', '..', 'uploads');
//             await fsPromises.mkdir(uploadsDir, { recursive: true });

//             // Generate unique filename
//             const cleanDocName = documentName.replace(/[^a-zA-Z0-9]/g, '_');
//             const timestamp = Date.now();
//             const baseFileName = `Doc_Attendance_${year}_${cleanDocName}_${timestamp}${fileExtension}`;
//             const tempFilePath = path.join(uploadsDir, baseFileName);

//             // Move uploaded file to temp location
//             await fsPromises.rename(file.path, tempFilePath);

//             // Upload to GCP Cloud Storage
//             const gcpResult = await uploadFileToGCP({
//                 filePath: tempFilePath,
//                 fileName: baseFileName,
//                 employeeId: targetEmployeeId.toString(), // Use target employee's ID for GCP path
//                 category: 'Attendance',
//                 type: 'AttendanceFile'
//             });

//             if (!gcpResult.success) {
//                 throw new Error(`Failed to upload attendance file to GCP: ${gcpResult.error}`);
//             }

//             const fileUrl = gcpResult.fileUrl!;

//             // Clean up temp file
//             try {
//                 await fsPromises.unlink(tempFilePath);
//             } catch (err) {
//                 console.warn(`Failed to delete temp file ${tempFilePath}:`, err);
//             }

//             // Create document record — employeeId = target employee, uploadedBy = admin
//             const document = new Document({
//                 employeeId: targetEmployeeId,  // ✅ The employee this attendance file belongs to
//                 type: 'AttendanceFile',
//                 category: 'Attendance',
//                 fileName: file.originalname,
//                 filePath: fileUrl,
//                 uploadDate: new Date(),
//                 uploadedBy: uploadedBy,         // ✅ Admin who uploaded
//                 accessLevel: 'Role-Based', // Accessible by admins and managers
//                 status: 'Uploaded',
//                 tags: ['Attendance', `${year}`],
//                 metadata: {
//                     attendanceFile: {
//                         documentName: documentName,
//                         year: year,
//                         uploadedAt: new Date(),
//                         description: description || undefined
//                     }
//                 },
//                 version: 1,
//                 auditLog: [{
//                     action: 'Upload',
//                     performedBy: uploadedBy,
//                     timestamp: new Date(),
//                     details: `Attendance file uploaded for employee ${targetEmployeeId}: ${documentName} for year ${year}`
//                 }]
//             });

//             await document.save();
//             return document;

//         } catch (error: any) {
//             throw new Error(`Failed to upload attendance file: ${error.message}`);
//         }
//     }

//     /**
//      * Send Offer Letter to Candidate
//      */
//     async sendOfferLetter(data: {
//         name: string;
//         email: string;
//         attachments: Array<{ fileName: string; filePath: string; localPath?: string; fieldname?: string }>;
//         uploadedBy: string
//     }): Promise<any> {
//         const { name, email, attachments, uploadedBy } = data;

//         // Generate a unique ID for this dispatch group
//         const dispatchId = `OFFER_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

//         // 1. Identify primary and secondary files
//         const primaryOffer = attachments.find(a => a.fieldname === 'offerLetter') || attachments[0];
//         const secondaryAnnexure = attachments.find(a => a.fieldname === 'annexure');

//         // 2. Create Single Document Record
//         const document = new Document({
//             employeeId: new Types.ObjectId().toString(), // Candidate ID placeholder
//             type: 'OfferLetter',
//             category: 'EmployeeLifecycle',
//             fileName: primaryOffer.fileName,
//             filePath: primaryOffer.filePath,
//             uploadDate: new Date(),
//             uploadedBy: new Types.ObjectId(uploadedBy),
//             status: 'Sent',
//             metadata: {
//                 offerLetter: {
//                     candidateName: name,
//                     candidateEmail: email,
//                     offerDate: new Date(),
//                     dispatchId,
//                     annexure: secondaryAnnexure ? {
//                         fileName: secondaryAnnexure.fileName,
//                         filePath: secondaryAnnexure.filePath
//                     } : undefined
//                 }
//             },
//             auditLog: [{
//                 action: 'Upload',
//                 performedBy: new Types.ObjectId(uploadedBy),
//                 timestamp: new Date(),
//                 details: `Offer Letter [${primaryOffer.fileName}]${secondaryAnnexure ? ' and Annexure [' + secondaryAnnexure.fileName + ']' : ''} uploaded and sent to ${email}`
//             }]
//         });

//         await document.save();
//         const createdDocuments = [document];

//         // 2. Prepare Email Attachments
//         const emailFiles = attachments.map(att => ({
//             filename: att.fileName,
//             path: att.localPath // Absolute local path for safe attachment
//         } as any));

//         // 3. Calculate Deadline (4 Business Days)
//         const calculateDeadline = (days: number) => {
//             let date = new Date();
//             let added = 0;
//             while (added < days) {
//                 date.setDate(date.getDate() + 1);
//                 if (date.getDay() !== 0 && date.getDay() !== 6) added++;
//             }
//             return date.toLocaleDateString('en-GB').replace(/\//g, '.'); // Format as DD.MM.YYYY
//         };
//         const deadline = calculateDeadline(4);

//         // 4. Send Unified Email
//         await emailService.sendEmail({
//             body: {
//                 to: email,
//                 subject: 'Offer Letter - Cloud Desk Technology',
//                 html: `
//                     <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px;">
//                         <p>Mr. ${name},</p>
//                         <p><strong>Congratulations!!</strong> Team- Cloud Desk and the Human Resource Management Team are pleased to invite you to join Cloud Desk Technology. The offer letter copy is enclosed.</p>
//                         <p>Appreciate it if you could confirm your acceptance by email and share a signed copy of the offer to initiate the onboarding and mobilization process along with the following documents (Clear Scans).</p>
                        
//                         <ol>
//                             <li><strong>Signed offer letter</strong> - kindly share it on or before <strong>${deadline}</strong></li>
//                             <li>Filled employment form</li>
//                         </ol>
                        
//                         <p>Many thanks for your interest and we look forward to you joining us!!</p>
                        
//                         <br>
//                         <div style="color: #004085; font-style: italic;">
//                             <strong>Thanks & Regards</strong><br>
//                             <strong>HR Team</strong><br>
//                             Cloud Desk Technology Pvt Ltd<br>
//                             Consulting | IT Staffing | Technology<br>
//                             Mobile: +91-8015441135<br>
//                             Email: myhr@clouddesk.ae<br>
//                             www.clouddesk.ae<br>
//                             <span style="font-size: 11px;">We are your one stop destination for 360-degree solutions of cloud CRM Implementation, mobile app development, and Data Analytics</span>
//                         </div>
//                     </div>
//                 `,
//                 text: `Congratulations!! Team- Cloud Desk and the Human Resource Management Team are pleased to invite you to join Cloud Desk Technology. Please share the signed offer letter on or before ${deadline}.`
//             },
//             files: emailFiles
//         });

//         return createdDocuments[0]; // Return the primary document for UI reference
//     }

//     /**
//      * Preview Hike Letter for Employee (No email sent, no DB record)
//      */
//     async previewHikeLetter(data: {
//         employeeIds: string[];
//         signatory: { name: string; designation: string; signaturePath?: string };
//     }): Promise<any> {
//         const { employeeIds, signatory } = data;
//         const employeesToProcess = [];

//         for (const empId of employeeIds) {
//             // 1. Fetch Data
//             const employee = await User.findById(empId).lean();
//             if (!employee) throw new Error(`Employee with ID ${empId} not found`);

//             const salaryAssignment = await SalaryAssignment.findOne({ employeeId: new Types.ObjectId(empId) }).sort({ createdAt: -1 }).lean();
//             if (!salaryAssignment) throw new Error(`Salary assignment not found for ${employee.name}. Please ensure they have an active salary assigned.`);
            
//             if (salaryAssignment.isActive === false) {
//                 throw new Error(`Salary assignment for ${employee.name} is currently inactive. Please activate it before generating a hike letter.`);
//             }
//             const salaryStructure = await SalaryStructure.findById(salaryAssignment.salaryStructureId).lean();
//             if (!salaryStructure) throw new Error(`Salary structure not found for ${employee.name}`);

//             employeesToProcess.push({
//                 employee,
//                 salaryAssignment,
//                 salaryStructure,
//             });
//         }

//         if (employeesToProcess.length === 0) {
//             throw new Error('No valid employee data found for preview. Please ensure salary assignments are active for selected employees.');
//         }

//         // 2. Call Refined Helper for PDF Generation and GCP Upload
//         const { generateHikeLetterPDF } = await import('./hike-letter-puppeteer.helper');
//         const fileUrl = await generateHikeLetterPDF({
//             employees: employeesToProcess,
//             signatory: {
//                 name: signatory.name,
//                 designation: signatory.designation,
//                 signaturePath: signatory.signaturePath
//             }
//         });

//         return { fileUrl };
//     }

//     /**
//      * Generate and Send Hike Letter for Employee
//      */
//     async generateAndSendHikeLetter(data: {
//         employeeId: string;
//         signatory: { name: string; designation: string; signaturePath?: string };
//         adminId: string;
//         dispatchId?: string;
//         newCtc?: number;
//         percentageIncrease?: number;
//         batchName?: string;
//         signatureBase64?: string;
//     }): Promise<any> {
//         const { employeeId, signatory, adminId, dispatchId, newCtc, percentageIncrease, batchName, signatureBase64 } = data;

//         // 1. Fetch Data
//         const employee = await User.findById(employeeId).lean();
//         if (!employee) throw new Error('Employee not found');

//         const salaryAssignment = await SalaryAssignment.findOne({ employeeId: new Types.ObjectId(employeeId) }).sort({ createdAt: -1 }).lean();
//         if (!salaryAssignment) throw new Error(`Salary assignment not found for ${employee.name}. Please ensure they have an active salary assigned.`);

//         if (salaryAssignment.isActive === false) {
//             throw new Error(`Salary assignment for ${employee.name} is currently inactive. Please activate it before generating a hike letter.`);
//         }

//         const salaryStructure = await SalaryStructure.findById(salaryAssignment.salaryStructureId).lean();
//         if (!salaryStructure) throw new Error(`Salary structure not found for ${employee.name}`);

//         // 2. Call Refined Helper for PDF Generation and GCP Upload
//         const { generateHikeLetterPDF } = await import('./hike-letter-puppeteer.helper');
//         const fileUrl = await generateHikeLetterPDF({
//             employees: [{
//                 employee,
//                 salaryAssignment,
//                 salaryStructure,
//             }],
//             signatory: {
//                 name: signatory.name,
//                 designation: signatory.designation,
//                 signaturePath: signatory.signaturePath
//             }
//         });

//         const fileName = fileUrl.split('/').pop() || 'HikeLetter.pdf';

//         // 3. Create Document Record
//         const document = new Document({
//             employeeId: new Types.ObjectId(employeeId),
//             type: 'HikeLetter',
//             category: 'EmployeeLifecycle',
//             fileName,
//             filePath: fileUrl,
//             uploadDate: new Date(),
//             uploadedBy: new Types.ObjectId(adminId),
//             status: 'Sent',
//             metadata: {
//                 hikeLetter: {
//                     effectiveDate: (salaryAssignment as any).effectiveFrom || new Date(),
//                     monthlyGross: (salaryAssignment as any).monthlyGross,
//                     newCtc: newCtc || (salaryAssignment as any).monthlyGross * 12, // Handle fallback or provided values
//                     percentageIncrease: percentageIncrease || 0,
//                     batchName: batchName,
//                     dispatchId,
//                     employeeCode: employee.employeeCode,
//                     employeeName: employee.name,
//                     employeeEmail: employee.email,
//                     signatoryName: signatory.name,
//                     signatoryDesignation: signatory.designation,
//                     signatureBase64: signatureBase64
//                 }
//             },
//             auditLog: [{
//                 action: 'Generate',
//                 performedBy: new Types.ObjectId(adminId),
//                 timestamp: new Date(),
//                 details: `Hike Letter generated and sent to ${employee.name}`
//             }]
//         });

//         await document.save();

//         // 4. Send Email (Fetch PDF buffer from GCP URL for attachment)
//         const pdfBuffer = await emailService.fetchPdfBuffer(fileUrl);
//         const { formatOrdinalDate } = await import('./hike-letter-puppeteer.helper');
//         const effectiveDateStr = formatOrdinalDate((salaryAssignment as any).effectiveFrom || new Date());
//         const firstName = employee.name.split(' ')[0];

//         await (emailService as any).transporter.sendMail({
//             from: `"Cloud Desk HR" <${(config as any).GMAIL_AUTH_USER}>`,
//             to: (employee as any).email,
//             subject: `Salary Revision Letter - ${(employee as any).name}`,
//             html: `
//                 <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px;">
//                     <p>Dear ${firstName},</p>
//                     <p>Greetings from Cloud Desk HR Department!</p>
//                     <p><strong style="color: #004085;">Congratulations!</strong></p>
//                     <p>In recognition of your performance, we are glad to inform you that the company has revised your salary effective <strong>${effectiveDateStr}</strong>.</p>
//                     <p>We would like to take this opportunity to express our appreciation for your contribution to the organization and hope that you will continue to strive for better results. We hope you will shoulder your new responsibility with full dedication and sincerity.</p>
                    
//                     <br>
//                     <div style="color: #004085; font-style: italic;">
//                         <strong>Thanks & Regards</strong><br>
//                         <strong>HR Team</strong><br>
//                         Cloud Desk Technology Pvt Ltd<br>
//                         Consulting | IT Staffing | Technology<br>
//                         Mobile: +91-8015441135<br>
//                         Email: myhr@clouddesk.ae<br>
//                         www.clouddesk.ae<br>
//                         <span style="font-size: 11px;">We are your one stop destination for 360-degree solutions of cloud CRM Implementation, mobile app development, and Data Analytics</span>
//                     </div>
                    
//                     <br>
//                     <hr border="0" style="border-top: 1px solid #eee;">
//                     <p style="font-size: 10px; color: #999; font-style: italic;">
//                         The information contained in this communication is intended solely for the use of the individual or entity to whom it is addressed and others authorized to receive it. It may contain confidential or legally privileged information. If you are not the intended recipient you are hereby notified that any disclosure, copying, distribution or taking any action in reliance on the contents of this information is strictly prohibited and may be unlawful.
//                     </p>
//                 </div>
//             `,
//             attachments: [{
//                 filename: fileName,
//                 content: pdfBuffer,
//                 contentType: 'application/pdf'
//             }]
//         });

//         return document;
//     }
// }

