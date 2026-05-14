import { Schema, model, Document, } from "mongoose";

export interface IField {
    apiName: string;
    fieldType: string;
    label: string;
    referenceTo: string;
}

export interface IFilterValue {
    type: "relative" | "absolute";
    value: string;
    relativeDataUnit?: string;
}

export interface IFilter {
    id: string;
    field: IField;
    operator: string;
    value: IFilterValue;
    fieldInstance: IField;
}

export interface IObject {
    label: string;
    name: string;
}

export interface IReference {
    dataUnitId: string;
}

export interface IDataUnit {
    id: string;
    name: string;
    apiName: string;
    description?: string;
    object: IObject;
    fields: IField[];
    filters: IFilter[];
    filterLogic?: string;
    children: string[];
    type: "Primary" | "Dependent";
    limit?: number;
    references?: IReference[];
}

export interface IDataUnit extends Document {
    templateType: string;
    dataUnits: IDataUnit[];
}

const FieldSchema = new Schema<IField>(
    {
        apiName: { type: String, required: true },
        fieldType: { type: String, required: true },
        label: { type: String, required: true },
        referenceTo: { type: String, default: "N/A" },
    },
    { _id: false }
);

const FilterValueSchema = new Schema<IFilterValue>(
    {
        type: { type: String, enum: ["relative", "absolute"], required: true },
        value: { type: String, required: true },
        relativeDataUnit: { type: String },
    },
    { _id: false }
);

const FilterSchema = new Schema<IFilter>(
    {
        id: { type: String, required: true },
        field: { type: FieldSchema, required: true },
        operator: { type: String, required: true },
        value: { type: FilterValueSchema, required: true },
        fieldInstance: { type: FieldSchema, required: true },
    },
    { _id: false }
);

const ObjectSchema = new Schema<IObject>(
    {
        label: { type: String, required: true },
        name: { type: String, required: true },
    },
    { _id: false }
);

const ReferenceSchema = new Schema<IReference>(
    {
        dataUnitId: { type: String, required: true },
    },
    { _id: false }
);

const DataUnitSchema = new Schema<IDataUnit>(
    {
        id: { type: String, required: true },
        name: { type: String, required: true },
        apiName: { type: String, required: true },
        description: { type: String, default: "" },
        object: { type: ObjectSchema, required: true },
        fields: { type: [FieldSchema], default: [] },
        filters: { type: [FilterSchema], default: [] },
        filterLogic: { type: String, default: "" },
        children: { type: [String], default: [] },
        type: { type: String, enum: ["Primary", "Dependent"], required: true },
        limit: { type: Number, default: 10 },
        references: { type: [ReferenceSchema], default: [] },
    },
    { _id: false }
);

const DataUnit = new Schema<IDataUnit>(
    {
        templateType: { type: String, required: true },
        dataUnits: { type: [DataUnitSchema], required: true },
    },
    {
        timestamps: true,
    }
);

// Indexes for efficient querying
DataUnit.index({ templateType: 1 });

// Exporting the model
export const DataUnitModel = model<IDataUnit>("DataUnit", DataUnit);
