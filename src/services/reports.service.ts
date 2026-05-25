import { Model, FilterQuery, Types } from 'mongoose';
import { ReportModel, IReport } from '../models/reports.model';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';

export class ReportService extends BaseService {
    protected context: RequestContext;
    private reportModel: Model<IReport>;
    constructor(context: RequestContext) {
        super(context);
        this.context = context;
        this.reportModel = ReportModel;
    }



    //get reports by id
    async getReportById(id: string): Promise<IReport> {
        if (!Types.ObjectId.isValid(id)) {
            throw new Error('Invalid report ID');
        }

        const report = await this.reportModel
            .findById(id)

        console.log(report, "get report")
        if (!report) {
            throw new Error('Report not found');
        }

        return report;
    }

    /**
     * Get readable query string for a report
     */
    async getReadableQueryString(id: string): Promise<{ readableQuery: string; baseQuery: any }> {
        const report = await this.getReportById(id);
        
        const readableQuery = this.generateReadableQueryString(report);
        const baseQuery = JSON.parse(report.query || '{}');
        
        return {
            readableQuery,
            baseQuery
        };
    }

    /**
     * Create a new report
     */
    async createReport(reportData: Partial<IReport>): Promise<any> {
        // Generate the base query string (without filters, sort, limit)
        console.log("create 1 ", reportData)
        reportData.query = this.generateBaseQueryString(reportData);
        console.log("create 2", reportData)
        const report = new this.reportModel(reportData);

        return await report.save();
    }

    /**
     * Update an existing report
     */
    async updateReport(id: string, reportData: Partial<IReport>): Promise<IReport | null> {
        console.log("updateReport", reportData)
        // First check if the report exists
        const existingReport = await this.reportModel.findById(id);
        if (!existingReport) {
            throw new Error(`Report with ID ${id} not found`);
        }

        // Generate base query if object or fields have changed
        if (reportData.object || reportData.fields) {
            reportData.query = this.generateBaseQueryString({
                ...existingReport.toObject(),
                ...reportData
            });
        }

        // Generate full query if filters, sort, or limit have changed
        if (reportData.filters || reportData.filterLogic || reportData.sortFields || reportData.limit) {
            reportData.query = this.generateQueryString({
                ...existingReport.toObject(),
                ...reportData
            });
        }

        return await this.reportModel.findByIdAndUpdate(
            id,
            reportData,
            { new: true, runValidators: true }
        );
    }

    /**
     * Get reports with filtering and pagination
     */
    async getReports(filter: FilterQuery<IReport> = {}, skip = 0, limit = 10): Promise<IReport[]> {
        return await this.reportModel
            .find(filter)
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });
    }

    /**
     * Count reports matching a filter
     */
    async countReports(filter: FilterQuery<IReport> = {}): Promise<number> {
        return await this.reportModel.countDocuments(filter);
    }

    /**
     * Execute a report query
     */
    async executeReport(
        reportId?: string,
        queryInput?: string | Record<string, any>,
        parameters?: Record<string, any>
    ): Promise<{ data: any[]; count: number; queryExecuted: any }> {
        let queryConfig = {
            filter: {},
            projection: {},
            sort: {},
            limit: 100
        };

        console.log("Input query:", queryInput);
        let targetCollection: string;

        // Handle report-based query
        if (reportId) {
            const report = await this.reportModel.findById(reportId);
            if (!report) {
                throw new Error(`Report with ID ${reportId} not found`);
            }
            targetCollection = report.object;

            // Handle the query input
            if (queryInput && typeof queryInput === 'object') {
                // Extract the components from the input query
                queryConfig = {
                    filter: queryInput.filter || {},
                    projection: queryInput.projection || {},
                    sort: queryInput.sort || {},
                    limit: queryInput.limit || 100
                };
            } else if (report.query) {
                try {
                    queryConfig = JSON.parse(report.query);
                } catch (error) {
                    throw new Error('Invalid query format in saved report');
                }
            }
        } else {
            throw new Error('ReportId must be provided');
        }

        // Security checks
        if (!targetCollection || targetCollection.startsWith('system.') || targetCollection === 'admin') {
            throw new Error('Invalid or unauthorized collection access');
        }

        console.log("Processed query configuration:", {
            targetCollection,
            queryConfig
        });

        try {
            const db = this.reportModel.db.db;
            const collection = db.collection(targetCollection);

            // Apply pagination
            const skip = Number(parameters?.skip) || 0;
            const limit = queryConfig.limit || 100;

            const initialStages: any[] = [
                { $match: queryConfig.filter }
            ];

            // 1. Auto-resolve standard User reference depending on 'targetCollection'
            const hasUserId = ['leaves', 'permissions', 'wfhs', 'attendancerecords', 'attendanceregularizations', 'shiftassignments'].includes(targetCollection.toLowerCase()) || targetCollection === 'document';
            const hasEmployeeId = ['documents', 'taxdeclarations', 'form12bs', 'form12bbs', 'payslips', 'payrolls', 'salaryassignments', 'salarystructures'].includes(targetCollection.toLowerCase());
            
            if (hasUserId || hasEmployeeId) {
                // This lookup retrieves the user details into a temporary array
                initialStages.push({
                    $lookup: {
                        from: 'users',
                        localField: hasUserId ? 'userId' : 'employeeId',
                        foreignField: '_id',
                        as: '_populatedUser'
                    }
                });
                initialStages.push({
                    $unwind: { path: '$_populatedUser', preserveNullAndEmptyArrays: true }
                });

                // Attach 'user' and 'employee' generic structures just in case they're queried
                initialStages.push({
                    $addFields: {
                        user: {
                            name: '$_populatedUser.name',
                            email: '$_populatedUser.email',
                            employeeCode: '$_populatedUser.employeeCode'
                        },
                        employee: {
                            name: '$_populatedUser.name',
                            email: '$_populatedUser.email',
                            employeeCode: '$_populatedUser.employeeCode'
                        }
                    }
                });
            }

            // 2. Patch native booleans so they avoid 'undefined' inside aggregations
            if (targetCollection.toLowerCase() === 'leaves' || targetCollection.toLowerCase() === 'wfhs' || targetCollection.toLowerCase() === 'permissions') {
                 initialStages.push({
                    $addFields: {
                        managerApproved: { $ifNull: [ "$managerApproved", false ] },
                        adminApproved: { $ifNull: [ "$adminApproved", false ] },
                        appliedOnBehalf: { $ifNull: [ "$appliedOnBehalf", false ] }
                    }
                 });
            }

            // Execute query with aggregation
            const pipeline = [
                ...initialStages,
                // Get total count and data
                {
                    $facet: {
                        metadata: [{ $count: "total" }],
                        data: [
                            { $skip: skip },
                            { $limit: limit },
                            // Apply projection if specified
                            ...(Object.keys(queryConfig.projection).length > 0
                                ? [{ $project: queryConfig.projection }]
                                : []),
                            // Apply sorting if specified
                            ...(Object.keys(queryConfig.sort).length > 0
                                ? [{ $sort: queryConfig.sort }]
                                : [])
                        ]
                    }
                }
            ];

            console.log("Executing pipeline:", JSON.stringify(pipeline, null, 2));
            const [result] = await collection.aggregate(pipeline).toArray();
            console.log("Query result:", result);

            let returnedData = result?.data || [];

            // Check if this collection contains Grade/Merit data
            const lowColl = targetCollection.toLowerCase();
            if (
                lowColl === 'annual_assignments' ||
                lowColl === 'annual_decisions' ||
                lowColl === 'pmsannualassignments' ||
                lowColl === 'pmsannualdecisions'
            ) {
                const actorRole = this.context.user?.role || 'employee';
                
                const { accessService } = await import('./access.service');
                const hasVisibilityOverride = this.context.user ? (await accessService.canPerform({
                    actor: { actorId: this.context.user._id.toString(), actorRole: this.context.user.role },
                    action: 'assignment.visibility.override',
                    requiresAdmin: true
                })).allowed : false;

                // Get all annualAssignmentIds from the returned data
                const assignmentIds = returnedData.map((item: any) => {
                    if (lowColl === 'annual_assignments' || lowColl === 'pmsannualassignments') {
                        return item._id;
                    }
                    return item.annualAssignmentId;
                }).filter(Boolean);

                // Load visibility configs in bulk
                const { VisibilityConfiguration } = await import('../models/pms-visibility-configuration.model');
                const visConfigs = await VisibilityConfiguration.find({
                    annualAssignmentId: { $in: assignmentIds },
                    isDeleted: false
                }).lean();

                const visMap = new Map<string, any>();
                for (const cfg of visConfigs) {
                    visMap.set(cfg.annualAssignmentId.toString(), cfg);
                }

                const { visibilityMaskService } = await import('./visibilityMask.service');

                returnedData = returnedData.map((item: any) => {
                    const assId = (lowColl === 'annual_assignments' || lowColl === 'pmsannualassignments' ? item._id : item.annualAssignmentId)?.toString();
                    const cfg = visMap.get(assId);

                    const maskCtx = {
                        actorRole,
                        employeeGradeVisible: cfg?.employeeGradeVisible ?? false,
                        employeeMeritVisible: cfg?.employeeMeritVisible ?? false,
                        managerGradeVisible: cfg?.managerGradeVisible ?? false,
                        managerMeritVisible: cfg?.managerMeritVisible ?? false,
                        visibleFrom: cfg?.visibleFrom,
                        hasVisibilityOverride,
                    };

                    return visibilityMaskService.mask(item, maskCtx);
                });
            }

            return {
                data: returnedData,
                count: result?.metadata?.[0]?.total || 0,
                queryExecuted: {
                    filter: queryConfig.filter,
                    projection: queryConfig.projection,
                    sort: queryConfig.sort,
                    skip,
                    limit
                }
            };

        } catch (error: any) {
            console.error("Query execution error:", error);
            throw new Error(`Error executing query: ${error.message}`);
        }
    }

    /**
     * Generate base MongoDB query string (without filters, sort, limit)
     * This creates a simple query with just object and fields
     */
    private generateBaseQueryString(reportData: Partial<IReport>): string {
        // Create a base query configuration object with only object and fields
        const baseQueryConfig = {
            object: reportData.object || '',
            projection: {} as Record<string, any>
        };

        // Build the projection object from fields
        if (reportData.fields && reportData.fields.length > 0) {
            reportData.fields.forEach(field => {
                baseQueryConfig.projection[field.apiName] = 1;
            });
        } else {
            // If no fields are specified, include all fields (empty projection)
            baseQueryConfig.projection = {};
        }

        return JSON.stringify(baseQueryConfig);
    }

    /**
     * Generate human-readable SQL-like query string for display purposes
     */
    private generateReadableQueryString(reportData: Partial<IReport>): string {
        const object = reportData.object || '';
        const fields = reportData.fields || [];
        
        if (fields.length === 0) {
            return `SELECT * FROM ${object}`;
        }
        
        const fieldNames = fields.map(field => field.apiName).join(', ');
        return `SELECT ${fieldNames} FROM ${object}`;
    }

    /**
     * Generate MongoDB query string from report configuration (with filters, sort, limit)
     */
    private generateQueryString(reportData: Partial<IReport>): string {
        // Create a structured query configuration object
        const queryConfig = {
            filter: {} as Record<string, any>,
            projection: {} as Record<string, any>,
            sort: {} as Record<string, number>,
            limit: reportData.limit || 10
        };

        // 1. Build the filter object
        if (reportData.filters && reportData.filters.length > 0) {
            reportData.filters.forEach(filter => {
                switch (filter.condition) {
                    case "equals":
                        queryConfig.filter[filter.field] = filter.value;
                        break;
                    case "contains":
                        queryConfig.filter[filter.field] = { $regex: filter.value, $options: "i" };
                        break;
                    case "starts with":
                        queryConfig.filter[filter.field] = { $regex: "^" + filter.value, $options: "i" };
                        break;
                    case "ends with":
                        queryConfig.filter[filter.field] = { $regex: filter.value + "$", $options: "i" };
                        break;
                    case "greater than":
                        queryConfig.filter[filter.field] = { $gt: this.convertToAppropriateType(filter.value) };
                        break;
                    case "less than":
                        queryConfig.filter[filter.field] = { $lt: this.convertToAppropriateType(filter.value) };
                        break;
                    case "not equals":
                        queryConfig.filter[filter.field] = { $ne: filter.value };
                        break;
                    default:
                        queryConfig.filter[filter.field] = filter.value;
                }
            });
        }

        // 2. Build the projection object (only if fields are provided and non-empty)
        if (reportData.fields && reportData.fields.length > 0) {
            reportData.fields.forEach(field => {
                queryConfig.projection[field.apiName] = 1;
            });
        } else {
            // If no fields are specified, include all fields (empty projection)
            queryConfig.projection = {};
        }

        // 3. Build the sort object
        if (reportData.sortFields && reportData.sortFields.length > 0) {
            reportData.sortFields.forEach(sortField => {
                queryConfig.sort[sortField.field] = sortField.order === "Ascending" ? 1 : -1;
            });
        }

        // Include filter logic if provided
        if (reportData.filterLogic && reportData.filterLogic.trim() !== '') {
            // Parse and apply filter logic to combine filters
            queryConfig.filter = this.buildFilterLogicQuery(reportData.filters || [], reportData.filterLogic);
        }

        return JSON.stringify(queryConfig);
    }

    /**
     * Build MongoDB query from filter logic string
     */
    private buildFilterLogicQuery(filters: any[], filterLogic: string): any {
        // If no filters or filter logic, return empty filter
        if (!filters || filters.length === 0 || !filterLogic || filterLogic.trim() === '') {
            return {};
        }

        // Validate filter logic
        const validationErrors = this.validateFilterLogic(filters, filterLogic);
        if (validationErrors.length > 0) {
            throw new Error(`Invalid filter logic: ${validationErrors.join(', ')}`);
        }

        // Convert individual filters to MongoDB conditions
        const filterConditions = filters.map((filter, index) => {
            const mongoCondition = this.convertFilterToMongo(filter);
            return { index: index + 1, condition: mongoCondition };
        });

        // Parse the filter logic
        const parsedLogic = this.parseFilterLogic(filterLogic, filterConditions);

        // Build the final query
        return this.buildFinalQuery(parsedLogic);
    }

    /**
     * Convert a single filter to MongoDB condition
     */
    private convertFilterToMongo(filter: any): any {
        const { field, condition, value, subFilters } = filter;
        
        // Handle nested object fields
        if (subFilters && subFilters.length > 0) {
            const nestedField = subFilters[0];
            const fullFieldPath = `${field}.${nestedField}`;
            return this.buildCondition(fullFieldPath, condition, value);
        }
        
        // Handle regular fields
        return this.buildCondition(field, condition, value);
    }

    /**
     * Build MongoDB condition for a field
     */
    private buildCondition(field: string, condition: string, value: string): any {
        switch (condition) {
            case "equals":
                return { [field]: { $eq: this.convertToAppropriateType(value) } };
                
            case "contains":
                return { [field]: { $regex: value, $options: 'i' } };
                
            case "starts with":
                return { [field]: { $regex: `^${value}`, $options: 'i' } };
                
            case "ends with":
                return { [field]: { $regex: `${value}$`, $options: 'i' } };
                
            case "greater than":
                return { [field]: { $gt: this.convertToAppropriateType(value) } };
                
            case "less than":
                return { [field]: { $lt: this.convertToAppropriateType(value) } };
                
            case "between":
                const [min, max] = value.split(',').map(v => this.convertToAppropriateType(v.trim()));
                return { [field]: { $gte: min, $lte: max } };
                
            case "in":
                const values = value.split(',').map(v => v.trim());
                return { [field]: { $in: values } };
                
            case "true":
                return { [field]: true };
                
            case "false":
                return { [field]: false };
                
            case "before":
                return { [field]: { $lt: new Date(value) } };
                
            case "after":
                return { [field]: { $gt: new Date(value) } };
                
            case "not equals":
                return { [field]: { $ne: this.convertToAppropriateType(value) } };
                
            default:
                return { [field]: { $eq: this.convertToAppropriateType(value) } };
        }
    }

    /**
     * Parse filter logic string and replace filter numbers with conditions
     */
    private parseFilterLogic(logic: string, filterConditions: any[]): any {
        // Convert filter logic to MongoDB query structure
        const tokens = logic.split(/\s+/);
        const conditions: any[] = [];
        let operator: string | null = null;
        
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i].trim();
            
            if (token === 'AND' || token === 'OR') {
                operator = token === 'AND' ? '$and' : '$or';
            } else if (/^\d+$/.test(token)) {
                // This is a filter number
                const filterIndex = parseInt(token) - 1;
                if (filterIndex >= 0 && filterIndex < filterConditions.length) {
                    conditions.push(filterConditions[filterIndex].condition);
                }
            }
        }
        
        // If we have multiple conditions and an operator, return the combined query
        if (conditions.length > 1 && operator) {
            return { [operator]: conditions };
        } else if (conditions.length === 1) {
            // Single condition, return it directly
            return conditions[0];
        } else {
            // No valid conditions
            return {};
        }
    }

    /**
     * Build final MongoDB query from parsed logic
     */
    private buildFinalQuery(parsedLogic: any): any {
        // parsedLogic is now already a MongoDB query object
        return parsedLogic;
    }



    /**
     * Validate filter logic syntax and filter references
     */
    private validateFilterLogic(filters: any[], filterLogic: string): string[] {
        const errors: string[] = [];
        
        // If no filters or filter logic, no validation needed
        if (!filters || filters.length === 0 || !filterLogic || filterLogic.trim() === '') {
            return errors;
        }
        
        // Validate filter logic syntax
        if (!/^[\d\s\(\)ANDOR]+$/.test(filterLogic)) {
            errors.push("Invalid filter logic syntax - only numbers, spaces, parentheses, AND, and OR are allowed");
        }
        
        // Validate filter numbers match actual filters
        const filterNumbers = filterLogic.match(/\d+/g) || [];
        if (filterNumbers.length > 0) {
            const maxFilterNumber = Math.max(...filterNumbers.map(Number));
            
            if (maxFilterNumber > filters.length) {
                errors.push(`Filter logic references filter ${maxFilterNumber} but only ${filters.length} filters exist`);
            }
        }
        
        // Validate individual filters
        filters.forEach((filter, index) => {
            if (!filter.field || !filter.condition || filter.value === undefined || filter.value === null) {
                errors.push(`Filter ${index + 1} is incomplete - missing field, condition, or value`);
            }
        });
        
        return errors;
    }

    /**
     * Convert string values to appropriate types when needed (numbers, booleans, etc)
     */
    private convertToAppropriateType(value: string): any {
        // Try to convert to number
        if (!isNaN(Number(value))) {
            return Number(value);
        }

        // Check for boolean
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;

        // Check for date
        const date = new Date(value);
        if (!isNaN(date.getTime())) return date;

        // Default to string
        return value;
    }
}

/**
 * 
 *   async executeReport(
        reportId?: string,
        queryString?: string | Record<string, any>,
        parameters?: Record<string, any>
    ): Promise<{ data: any[]; count: number; queryExecuted: any }> {
        let queryConfig: {
            filter: any;
            projection: any;
            sort: any;
            limit: number;
        } = { filter: {}, projection: {}, sort: {}, limit: 100 };

        console.log("Executing report with:", { reportId, queryString, parameters });
        let targetCollection: string;

        // Handle report-based query
        if (reportId) {
            const report = await this.reportModel.findById(reportId);
            if (!report) {
                throw new Error(`Report with ID ${reportId} not found`);
            }
            targetCollection = report.object;
            console.log(targetCollection, "collectionName")
            // If direct query is provided with reportId, use it as filter
            if (queryString && typeof queryString === 'object') {
                queryConfig.filter = queryString;
            } else {
                // Use report's stored query
                try {
                    queryConfig = report.query ? JSON.parse(report.query) : queryConfig;
                } catch (error) {
                    throw new Error('Invalid query format in saved report');
                }
            }
        }
        // Handle direct query without report
        else if (queryString) {
            if (typeof queryString === 'object') {
                queryConfig.filter = queryString;
            } else {
                try {
                    queryConfig = JSON.parse(queryString);
                } catch (error) {
                    throw new Error('Invalid query format. Query must be a valid JSON string or object');
                }
            }

            // Get collection from parameters
            if (!parameters?.collection) {
                throw new Error('Collection name must be provided when using direct query');
            }
            targetCollection = parameters.collection;
        } else {
            throw new Error('Either reportId or query must be provided');
        }

        // Security checks
        if (!targetCollection || targetCollection.startsWith('system.') || targetCollection === 'admin') {
            throw new Error('Invalid or unauthorized collection access');
        }
        console.log("filters ", queryConfig.filter)
        console.log("Final query configuration:", {
            targetCollection,
            queryConfig
        });

        try {
            const db = this.reportModel.db.db;
            const collection = db.collection(targetCollection);

            // Apply pagination
            const skip = Number(parameters?.skip) || 0;
            const limit = Number(parameters?.limit) || queryConfig.limit || 100;

            // Execute query with aggregation for better performance
            const pipeline = [
                // Apply filters
                { $match: queryConfig.filter },

                // Get total count
                {
                    $facet: {
                        metadata: [{ $count: "total" }],
                        data: [
                            { $skip: skip },
                            { $limit: limit },
                            // Apply projection if specified
                            ...(Object.keys(queryConfig.projection).length > 0
                                ? [{ $project: queryConfig.projection }]
                                : []),
                            // Apply sorting if specified
                            ...(Object.keys(queryConfig.sort).length > 0
                                ? [{ $sort: queryConfig.sort }]
                                : [])
                        ]
                    }
                }
            ];

            const [result] = await collection.aggregate(pipeline).toArray();

            return {
                data: result.data || [],
                count: result.metadata[0]?.total || 0,
                queryExecuted: {
                    filter: queryConfig.filter,
                    projection: queryConfig.projection,
                    sort: queryConfig.sort,
                    skip,
                    limit
                }
            };

        } catch (error: any) {
            console.error("Query execution error:", error);
            throw new Error(`Error executing query: ${error.message}`);
        }
    }
 */