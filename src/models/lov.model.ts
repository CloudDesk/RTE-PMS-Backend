import mongoose, { Document, Schema } from 'mongoose';

export interface ILOVValue {
  label: string;
  value: string;
  description?: string;
  isActive?: boolean;
}

export interface ILOV extends Document {
  name: string;
  type: string;
  values: ILOVValue[];
}

const LOVValueSchema: Schema = new Schema({
  label: { type: String, required: true },
  value: { type: String, required: true },
  description: String,
  isActive: { type: Boolean, default: true },
});

const LOVSchema: Schema = new Schema({
  name: { type: String, required: true },
  type: { type: String, required: true, unique: true },
  values: { type: [LOVValueSchema], required: true },
}, {
  collection: 'lovs'
});

export const LOV = mongoose.model<ILOV>('Lov', LOVSchema);

