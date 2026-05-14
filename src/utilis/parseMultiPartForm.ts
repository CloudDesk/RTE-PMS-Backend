import { FastifyRequest } from 'fastify';
import { MultipartFile } from '@fastify/multipart';

export async function parseMultipartForm(request: FastifyRequest) {
    const parts = request.parts();
    const body: Record<string, any> = {};
    const files: MultipartFile[] = [];

    for await (const part of parts) {
        if (part.type === 'file') {
            /**
             * IMPORTANT:
             * Fastify multipart file parts are streams. If we merely collect the MultipartFile objects
             * without consuming them, the underlying parser can stall (request appears "processing"
             * forever, especially as file size grows).
             *
             * We eagerly drain each file stream into a buffer here, and cache it on the part so that
             * downstream code that calls `toBuffer()` continues to work.
             */
            const filePart = part as MultipartFile;
            const buffer = await filePart.toBuffer();
            (filePart as any).__cachedBuffer = buffer;
            (filePart as any).toBuffer = async () => (filePart as any).__cachedBuffer as Buffer;
            files.push(filePart);
        } else {
            // It's a field part
            body[part.fieldname] = part.value;
        }
    }

    return { body, files };
}


import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

export async function saveMultipartFile(filePart: any, targetPath: string) {
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    
    // If parseMultipartForm already consumed the stream into a buffer, write that buffer
    if (filePart.__cachedBuffer) {
        await fs.promises.writeFile(targetPath, filePart.__cachedBuffer);
    } else {
        // Fallback for direct stream handling
        await pipeline(filePart.file, fs.createWriteStream(targetPath));
    }
}
