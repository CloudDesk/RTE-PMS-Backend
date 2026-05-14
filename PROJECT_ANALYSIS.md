# Zuno HR India API - Comprehensive Project Analysis

## 📋 Executive Summary

**Project Name:** Zuno HR India API (Tendly HRMS API Server)  
**Version:** 1.0.0  
**Technology Stack:** Node.js, TypeScript, Fastify, MongoDB, GCP  
**Deployment:** Google Cloud Platform (Cloud Run), AWS Lambda (legacy)  
**Primary Purpose:** Enterprise HRMS (Human Resource Management System) API for India and UAE operations

---

## 🏗️ Architecture Overview

### Technology Stack

#### **Backend Framework**
- **Fastify 5.2.0** - High-performance web framework
- **TypeScript 5.7.2** - Type-safe development
- **Node.js 18+** - Runtime environment

#### **Database**
- **MongoDB Atlas** - Primary database (M0 tier)
- **Mongoose 7.6.3** - ODM for MongoDB

#### **Authentication & Security**
- **JWT** (@fastify/jwt) - Token-based authentication
- **Cookies** (@fastify/cookie) - Session management
- **Argon2** - Password hashing
- **CORS** - Cross-origin resource sharing

#### **Cloud Infrastructure**
- **GCP Cloud Run** - Primary deployment (asia-south1)
- **GCP Cloud Storage** - File storage
- **AWS Lambda** - Legacy deployment support
- **Firebase Admin** - Push notifications

#### **Additional Services**
- **Swagger/OpenAPI** - API documentation
- **Nodemailer** - Email notifications
- **Puppeteer** - PDF generation
- **ExcelJS** - Excel file processing
- **Handlebars** - Email templates
- **Node-cron** - Scheduled tasks

---

## 📁 Project Structure

```
Zuno-hr-India-Api/
├── src/
│   ├── app.ts                 # Main application setup
│   ├── index.ts               # AWS Lambda entry point
│   ├── local.ts               # Local development entry point
│   ├── config/                # Configuration files
│   │   ├── database.ts        # MongoDB connection
│   │   ├── index.ts           # App configuration
│   │   ├── firebase/          # Firebase configuration
│   │   ├── multer.ts          # File upload config
│   │   └── swagger.ts         # API documentation config
│   ├── routes/                # API route handlers (35+ route files)
│   ├── services/              # Business logic layer (43 service files)
│   ├── models/                # Mongoose data models (30+ models)
│   ├── middleware/            # Request middleware
│   │   ├── auth.ts            # Authentication middleware
│   │   ├── role.ts            # Role-based access control
│   │   ├── container.ts       # Dependency injection
│   │   └── errorHandler.ts    # Error handling
│   ├── emails/                # Email service & templates
│   ├── types/                 # TypeScript type definitions
│   ├── container/             # Dependency injection container
│   ├── constants/             # Application constants
│   └── utilis/                # Utility functions
├── templates/                 # Handlebars email templates
├── scripts/                   # Migration & utility scripts
├── test/                      # Test files
└── uploads/                   # File uploads directory
```

---

## 🔑 Core Features & Modules

### 1. **User Management** (`user.service.ts`, `user.routes.ts`)
- User CRUD operations
- Multi-country support (India, UAE)
- Role-based access (admin, manager, staff, external)
- User hierarchy management
- Portal access control
- License type management (employee, external)
- Password reset functionality

### 2. **Authentication** (`auth.service.ts`, `auth.routes.ts`)
- JWT-based authentication
- Cookie-based session management
- Login/Logout
- Password reset flow
- Token verification

### 3. **Attendance Management**
- **Biometric Attendance** (`biometric-attendance.service.ts`)
  - Check-in/Check-out
  - Multiple swipe handling
  - Hours calculation
  - Timezone handling
- **Attendance Records** (`attendance-record.model.ts`)
  - Daily attendance tracking
  - Status management (Present, Absent, Half Day, etc.)
- **Attendance Regularization** (`attendance-regularization.service.ts`)
  - Regularization requests
  - Approval workflow
- **Attendance Override** (`attendance-override.service.ts`)
  - Manual attendance corrections
- **Bulk Upload** (`bulk-attendance-upload.service.ts`)
  - Excel-based bulk attendance import

### 4. **Leave Management** (`leave.service.ts`, `leave.routes.ts`)
- Leave application workflow
- Leave types (Sick, Casual, Annual, etc.)
- Leave approval/rejection
- Leave balance tracking
- Leave carry forward (`leave-carry-forward.service.ts`)
- Leave release (`leave-release.service.ts`)
- Leave summary (`leave-summary.service.ts`)
- Apply on behalf functionality

### 5. **Work From Home (WFH)** (`wfh.service.ts`)
- WFH request management
- WFH approval workflow
- WFH summary tracking

### 6. **Permission Management** (`permission.service.ts`)
- Permission requests
- Approval workflow
- Permission summary

### 7. **Shift Management** (`shift.service.ts`)
- Shift creation and management
- Shift assignments
- Shift change requests (`shift-change.service.ts`)
- Automatic shift status updates (cron job)

### 8. **Payroll System** (`payroll.service.ts`)
- Payroll processing
- Salary calculation (`payroll/salary-calculator.service.ts`)
- Salary structure management (`salary-structure.service.ts`)
- Salary assignments (`salary-assignment.service.ts`)
- Tax calculations
- Deductions and allowances
- India-specific payroll rules

### 9. **Payslip Generation** (`payslip.service.ts`)
- PDF payslip generation
- Payslip templates (Handlebars)
- Payslip download
- Historical payslip access

### 10. **Tax Management**
- **Tax Slabs** (`tax-slab.service.ts`)
- **Tax Declarations** (`tax-declaration.service.ts`)
- Form 12BB support

### 11. **Holiday & Calendar Management**
- **Holiday Calendar** (`holiday-calendar.service.ts`)
- **Weekend Calendar** (`weekend-calendar.service.ts`)
- **Optional Holidays** (`optional-holiday.service.ts`)
- Restricted holidays support

### 12. **Document Management** (`document.service.ts`)
- Document upload/download
- GCP Cloud Storage integration
- Document categorization
- Admin document upload

### 13. **Timesheet Management** (`timesheet.service.ts`)
- Timesheet entry
- Timesheet file uploads
- Timesheet approval

### 14. **Training Management** (`training.service.ts`)
- Training creation
- Training attendance tracking (`training-attendance.service.ts`)

### 15. **Overtime Management** (`overtime.service.ts`)
- Overtime logging
- Overtime approval
- Comp-off management

### 16. **Dashboard** (`dashboard.service.ts`)
- Analytics and reporting
- Employee statistics
- Attendance summaries

### 17. **Reports** (`reports.service.ts`)
- Various HR reports
- Export functionality

### 18. **Data Migration** (`data-migration.service.ts`)
- Excel import/export
- Bulk data operations
- Template generation
- Data validation

### 19. **List of Values (LOV)** (`lov.service.ts`)
- Dropdown value management
- Dynamic configuration

### 20. **Organization Management** (`organization.service.ts`)
- Organization settings
- Multi-tenant support

---

## 🗄️ Data Models (30+ Models)

### Core Models
- `User` - Employee information
- `AttendanceRecord` - Daily attendance
- `Attendance` - Attendance metadata
- `Leave` - Leave applications
- `LeaveSummary` - Leave balances
- `Shift` - Shift definitions
- `ShiftAssignment` - User-shift assignments
- `Payroll` - Payroll records
- `Payslip` - Payslip documents
- `SalaryStructure` - Salary components
- `SalaryAssignment` - Employee salary assignments

### Supporting Models
- `Document` - Document storage
- `HolidayCalendar` - Holiday definitions
- `WeekendCalendar` - Weekend configurations
- `TaxSlab` - Tax bracket definitions
- `TaxDeclaration` - Employee tax declarations
- `Timesheet` - Timesheet entries
- `Training` - Training programs
- `Overtime` - Overtime records
- `WFH` - Work from home requests
- `Permission` - Permission requests
- `AuditLog` - Audit trail
- `Dashboard` - Dashboard configurations
- `LOV` - List of values
- `Organization` - Organization settings

---

## 🔐 Security & Authentication

### Authentication Flow
1. User login → JWT token generation
2. Token stored in HTTP-only cookie
3. Middleware validates token on each request
4. User context injected into request container

### Security Features
- Password hashing with Argon2
- JWT token expiration
- Cookie-based session management
- Role-based access control (RBAC)
- Portal access validation
- Active user validation
- CORS configuration

### Middleware Stack
1. **Authentication** (`auth.ts`) - Validates JWT tokens
2. **Role-based Access** (`role.ts`) - Checks user permissions
3. **Container Injection** (`container.ts`) - Dependency injection
4. **Error Handling** (`errorHandler.ts`) - Global error handling

---

## 🚀 Deployment

### Primary Deployment: GCP Cloud Run
- **Region:** asia-south1
- **Port:** 5800
- **Memory:** 512Mi
- **CPU:** 1
- **Execution Environment:** gen2
- **Docker:** Multi-stage build with Node 20

### Deployment Scripts
```bash
npm run full-deploy  # Complete deployment pipeline
npm run hrms-build   # Docker build
npm run hrms-push    # Push to GCR
npm run hrms-deploy  # Deploy to Cloud Run
```

### Legacy: AWS Lambda
- Serverless deployment option
- Handler in `src/index.ts`
- Package script for Lambda deployment

---

## 📊 API Documentation

### Swagger/OpenAPI
- **Endpoint:** `/documentation`
- **UI:** Swagger UI
- **Security Schemes:**
  - Bearer Auth (JWT)
  - Cookie Auth

### API Routes (35+ route files)
All routes are prefixed and organized by feature:
- `/auth` - Authentication
- `/users` - User management
- `/attendance` - Attendance operations
- `/leaves` - Leave management
- `/payroll` - Payroll operations
- `/payslip` - Payslip generation
- `/shifts` - Shift management
- `/documents` - Document management
- And 25+ more route groups

---

## 🔄 Background Jobs & Cron

### Scheduled Tasks (`utilis/corn.ts`)
- Automatic shift assignment status updates
- Scheduled via `node-cron`

### Manual Triggers
- `/dev/run-shift-cron` - Manual shift status update

---

## 📧 Email System

### Email Service (`emails/services/email.service.ts`)
- **Provider:** Nodemailer
- **Templates:** Handlebars (.hbs files)
- **Templates Include:**
  - Welcome emails
  - Leave application/approval
  - Attendance regularization
  - Password reset
  - Resignation notifications
  - Shift assignments
  - Optional holiday requests

---

## 📁 File Management

### Storage
- **Local:** `/uploads` directory
- **Cloud:** GCP Cloud Storage
- **Service:** `file-upload.service.ts`

### File Types Supported
- PDF documents
- Excel files (.xlsx)
- Images (JPG, PNG)
- Word documents (.docx)

### File Operations
- Upload via multipart form
- Download with authentication
- GCP Cloud Storage integration
- Template file serving

---

## 🧪 Testing

### Test Framework
- **Jest** - Testing framework
- **ts-jest** - TypeScript support
- Test files in `/test` directory

### Test Scripts
```bash
npm test  # Run tests
```

---

## 🔧 Development Tools

### Scripts Available
```bash
npm run build          # TypeScript compilation
npm run start          # Start production server
npm run dev            # Development with nodemon
npm run lint           # ESLint code checking
npm run db:migrate     # Database migration
npm run db:clone       # Clone database
```

### Development Features
- Hot reload with nodemon
- TypeScript strict mode
- Source maps for debugging
- ESLint for code quality

---

## 📝 Code Quality & Standards

### TypeScript Configuration
- **Strict Mode:** Enabled
- **Target:** ES2020
- **Module:** CommonJS
- **Features:**
  - No unused locals/parameters
  - No implicit returns
  - Experimental decorators
  - Source maps enabled

### Code Organization
- **Service Layer Pattern** - Business logic in services
- **Base Service** - Common service functionality
- **Dependency Injection** - Container-based DI
- **Request Context** - User context per request

---

## 🌍 Multi-Country Support

### Supported Countries
- **India (IN)**
  - INR currency
  - India-specific payroll rules
  - Tax calculations (Form 12BB)
- **UAE (AE)**
  - AED currency
  - UAE-specific visa types
  - Different leave rules

### Country-Specific Features
- Currency handling
- Tax slab configurations
- Leave expiry rules
- Payroll calculations
- Holiday calendars

---

## 📈 Performance Considerations

### Database
- MongoDB Atlas (M0 tier)
- Connection pooling
- Index optimization needed

### Caching
- Redis Cloud (30MB) - Mentioned in docs but not visible in code
- Potential for query result caching

### File Handling
- Multipart form processing
- Large file support (150MB limit)
- Streaming for large files

---

## 🐛 Known Issues & Technical Debt

### Code Quality
1. **Large Service Files**
   - `data-migration.service.ts` - 3549 lines
   - `user.service.ts` - 2483 lines
   - `document.service.ts` - 2991 lines
   - **Recommendation:** Split into smaller modules

2. **Commented Code**
   - Multiple commented code blocks in `app.ts`
   - **Recommendation:** Remove or document

3. **Hardcoded Values**
   - Some cleanup routes with hardcoded user IDs
   - **Recommendation:** Move to configuration

### Architecture
1. **Error Handling**
   - Inconsistent error handling patterns
   - **Recommendation:** Standardize error responses

2. **Validation**
   - Limited request validation
   - **Recommendation:** Add schema validation (Fastify schema)

3. **Testing**
   - Limited test coverage
   - **Recommendation:** Increase test coverage

---

## 🔮 Future Enhancements

### Recommended Improvements
1. **API Versioning** - Add versioning to routes
2. **Rate Limiting** - Implement rate limiting
3. **Caching Layer** - Redis integration for caching
4. **Monitoring** - Add logging and monitoring (e.g., Winston, Sentry)
5. **Database Indexing** - Optimize MongoDB indexes
6. **API Pagination** - Standardize pagination across endpoints
7. **Request Validation** - Add Fastify schema validation
8. **Unit Tests** - Increase test coverage
9. **Documentation** - API endpoint documentation
10. **Performance Optimization** - Query optimization, lazy loading

---

## 📚 Documentation Files

The project includes extensive markdown documentation:
- Implementation guides
- Feature analysis documents
- Migration guides
- Frontend implementation guides
- Scenario analysis documents

**Key Documentation:**
- `ATTENDANCE_RECORD_ANALYSIS.md`
- `DEEP_ANALYSIS_USERS_PAYROLL_PAYSLIP.md`
- `LEAVE_MODULE_FEATURES_SUMMARY.md`
- `PAYROLL_FIX_FOR_HALFDAY.md`
- And 50+ more documentation files

---

## 🎯 Project Statistics

- **Total Services:** 43
- **Total Routes:** 35+
- **Total Models:** 30+
- **Lines of Code:** ~50,000+ (estimated)
- **Dependencies:** 30+ production dependencies
- **Dev Dependencies:** 10+ development dependencies

---

## ✅ Strengths

1. **Comprehensive Feature Set** - Complete HRMS solution
2. **Multi-Country Support** - India and UAE
3. **Modern Tech Stack** - Fastify, TypeScript, MongoDB
4. **Cloud-Ready** - GCP deployment configured
5. **Well-Organized Structure** - Clear separation of concerns
6. **Extensive Documentation** - Many markdown guides
7. **Email Integration** - Complete email notification system
8. **File Management** - GCP Storage integration

---

## ⚠️ Areas for Improvement

1. **Code Modularity** - Split large service files
2. **Test Coverage** - Add comprehensive tests
3. **Error Handling** - Standardize error responses
4. **Validation** - Add request schema validation
5. **Performance** - Database indexing, query optimization
6. **Monitoring** - Add application monitoring
7. **Security** - Security audit, rate limiting
8. **Documentation** - API endpoint documentation

---

## 🔍 Key Files to Review

### Critical Files
- `src/app.ts` - Application setup
- `src/services/user.service.ts` - User management
- `src/services/payroll.service.ts` - Payroll logic
- `src/services/data-migration.service.ts` - Data import/export
- `src/routes/index.ts` - Route registration
- `src/config/index.ts` - Configuration

### Models to Understand
- `src/models/user.model.ts` - User schema
- `src/models/attendance-record.model.ts` - Attendance tracking
- `src/models/payroll.model.ts` - Payroll structure
- `src/models/leave.model.ts` - Leave management

---

## 📞 Support & Maintenance

### Environment Variables Required
- `MONGODB_URI` - Database connection
- `JWT_SECRET` - JWT signing secret
- `COOKIE_SECRET` - Cookie encryption
- `PORT` - Server port (default: 5800)
- `CORS_ORIGINS` - Allowed origins
- `GCP_STORAGE_BUCKET` - GCP bucket name
- `PROJECT_ID` - GCP project ID
- Email configuration variables

---

## 🎓 Conclusion

This is a **comprehensive, production-ready HRMS API** with extensive features for managing human resources in India and UAE. The codebase is well-structured but would benefit from refactoring large service files, adding comprehensive tests, and implementing better monitoring and validation.

The project demonstrates:
- ✅ Strong feature completeness
- ✅ Modern technology choices
- ✅ Cloud-native architecture
- ⚠️ Needs code modularization
- ⚠️ Needs improved test coverage
- ⚠️ Needs performance optimization

**Overall Assessment:** **Production-ready with room for improvement in code organization and testing.**

