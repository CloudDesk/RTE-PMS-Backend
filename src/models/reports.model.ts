import { Schema, model, Document } from "mongoose";

export interface IField {
    apiName: string;
    fieldType: string;
    label: string;
    referenceTo: string;
}

export interface IFilter {
    field: string;
    condition: string;
    value: string;
    nestedFields: string[];
    subFilters: any[];
    isNestedObject: boolean;
}

export interface ISortField {
    field: string;
    order: "Ascending" | "Descending";
}

export interface IReport extends Document {
    name: string;
    apiName: string;
    description: string;
    object: string;
    fields: IField[];
    filters?: IFilter[];
    filterLogic?: string;
    sortFields?: ISortField[];
    limit?: number;
    // preview: any;
    query: any;
    // id has been removed, we'll use the default _id from MongoDB
}

const FieldSchema = new Schema<IField>(
    {
        apiName: { type: String, required: true },
        fieldType: { type: String, required: true },
        label: { type: String, required: true },
        referenceTo: { type: String, default: "" },
    },
    { _id: false }
);

const FilterSchema = new Schema<IFilter>(
    {
        field: { type: String, required: true },
        condition: { type: String, required: true },
        value: { type: String, required: true },
        nestedFields: { type: [String], default: [] },
        subFilters: { type: [Schema.Types.Mixed] as any[], default: [] },
        isNestedObject: { type: Boolean, default: false },
    },
    { _id: false }
);

const SortFieldSchema = new Schema<ISortField>(
    {
        field: { type: String, required: true },
        order: { type: String, enum: ["Ascending", "Descending"], required: true },
    },
    { _id: false }
);

const ReportSchema = new Schema<IReport>(
    {
        name: { type: String, required: true },
        apiName: { type: String, required: true },
        description: { type: String, default: "" },
        object: { type: String, required: true },
        fields: { type: [FieldSchema], default: [] },
        filters: { type: [FilterSchema], default: [] },
        filterLogic: { type: String, default: "" },
        sortFields: { type: [SortFieldSchema], default: [] },
        limit: { type: Number, default: 10, max: 500, min: 1 },
        // preview: { type: Schema.Types.Mixed, default: null },
        query: { type: String, default: "" },
        // Using default MongoDB _id now
    },
    {
        timestamps: true,
        collection: "reports" // Explicitly set the collection name
    }
);

// Indexes for efficient querying
ReportSchema.index({ apiName: 1 });
ReportSchema.index({ object: 1 });

// Exporting the model
export const ReportModel = model<IReport>("Report", ReportSchema);