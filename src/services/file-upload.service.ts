import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { join, parse } from 'path';
import { randomUUID } from 'crypto';
import { MultipartFile } from '@fastify/multipart';

export class FileUploadService {
    private static instance: FileUploadService;

    private constructor() { }

    static getInstance(): FileUploadService {
        if (!this.instance) {
            this.instance = new FileUploadService();
        }
        return this.instance;
    }

    async saveFile(file: MultipartFile): Promise<string> {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        // Create directory structure
        const uploadDir = join(process.cwd(), 'uploads', String(year), month, day);
        await mkdir(uploadDir, { recursive: true });

        // Generate unique filename
        const timestamp = date.toISOString()
            .replace(/[:.]/g, '-')
            .slice(0, 19);
        const uuid = randomUUID();
        const { name, ext } = parse(file.filename);
        const sanitizedName = name.replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `${timestamp}-${uuid}-${sanitizedName}${ext}`;

        const filepath = join(uploadDir, filename);

        // Save file
        await pipeline(file.file, createWriteStream(filepath));

        // Return relative path from uploads directory
        return join(String(year), month, day, filename);
    }
}

export const fileUploadService = FileUploadService.getInstance(); 