import mongoose from "mongoose";
import { RequestContext } from "../types/context";
import { BaseService } from "./base.service";

export class CollectionService extends BaseService {
    private collectionToModelMap: { [key: string]: string } = {};

    constructor(context: RequestContext) {
        super(context);
        this.buildCollectionModelMap();
    }
    private buildCollectionModelMap() {
        // Build a mapping between collection names and model names
        Object.keys(mongoose.models).forEach(modelName => {
            const model = mongoose.models[modelName];
            if (model.collection) {
                const collectionName = model.collection.collectionName;
                this.collectionToModelMap[collectionName] = modelName;
            }
        });

        // console.log('Collection to Model Map:', this.collectionToModelMap);
    }
    async getAllCollection() {
        const collections = await mongoose.connection.db.listCollections().toArray();
        return collections.map(col => col.name)
    }

    async getCollectionFields(name: string) {
        console.log(name, "name getCollectionFields")

        // Try to get the model name from the collection name
        const modelName = this.collectionToModelMap[name];

        if (!modelName) {
            // Log available mappings for debugging
            // console.log('Available Collection to Model Mappings:', this.collectionToModelMap);
            throw new Error(`Model for collection '${name}' not found`);
        }

        // Get the Mongoose model
        const Model = mongoose.models[modelName];

        if (!Model) {
            throw new Error(`Model '${modelName}' not found`);
        }



        // Recursive function to extract field details
        const extractFieldDetails = (schemaPath: any, parentPath: string = ''): any => {
            const fullPath = parentPath ? `${parentPath}.${schemaPath.path}` : schemaPath.path;

            // Handle nested schemas
            if (schemaPath.schema) {
                const nestedFields = Object.values(schemaPath.schema.paths)
                    .filter((path: any) => path.path !== '_id')
                    .map((nestedPath: any) => extractFieldDetails(nestedPath, fullPath));

                return {
                    field: fullPath,
                    type: 'Object',
                    nested: nestedFields
                };
            }

            // Determine field type and additional properties
            let fieldType = schemaPath.instance;

            // Handle array types
            if (fieldType === 'Array') {
                const arrayOf = schemaPath.caster;
                fieldType = arrayOf ? `Array of ${arrayOf.instance}` : 'Array';
            }

            // Handle special types like ObjectId
            if (schemaPath.options && schemaPath.options.type === mongoose.Schema.Types.ObjectId) {
                fieldType = 'ObjectId';
            }

            return {
                field: fullPath,
                type: fieldType,
                required: schemaPath.isRequired || false,
                references: schemaPath.options?.ref || null
            };
        };

        // Get schema fields with detailed information
        const fieldsWithTypes = Object.values(Model.schema.paths)
            .filter((path: any) => path.path !== '__v' && path.path !== '_id')
            .map((path: any) => extractFieldDetails(path));

        return fieldsWithTypes;
    }

}