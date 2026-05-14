

import Multer from 'fastify-multer';
import path from 'path'

const parentDir = path.resolve(__dirname, '../../uploads');

console.log(parentDir, 'parenDir ');
const fileMaxSize = 150 * 1024 * 1024;

//Disk storage for general file uploads
const diskStorage = Multer.diskStorage({
    destination: (req, file, cb) => {
        console.log(req)
        console.log(file)
        const ROOT_PATH = parentDir;
        cb(null, ROOT_PATH)
        // cb(null, '/src/uploads');
    },
    filename: (req, file, cb) => {
        console.log(req)
        cb(
            null,
            new Date().toISOString().replace(/:/g, '-') + '-' + file.originalname
        );
    }
});

// Memory storage for ZIP file uploads
const memoryStorage = Multer.memoryStorage();


// General file upload middleware (used by other routes)
const uploadGeneral = Multer({
    storage: diskStorage,
    limits: { fileSize: fileMaxSize },
});

const filesUpload: any = uploadGeneral.any();


// ZIP file upload middleware (for /form16/upload)
const uploadZip = Multer({
    storage: memoryStorage,
    limits: { fileSize: fileMaxSize },
    fileFilter: (_req, file, cb) => {
        if (!file.originalname.endsWith('.zip')) {
            return cb(new Error('Only ZIP files are allowed'));
        }
        cb(null, true);
    },
});


const zipFileUpload = uploadZip.single('file'); // Expect a single ZIP file with field name 'file'

export { filesUpload, zipFileUpload, Multer };

/*
if you're now using fastify-multipart with a manual parser like parseMultipartForm, then:

❌ You do NOT need to use preHandler: [filesUpload] anywhere in your project anymore.

🔍 Why?
preHandler: [filesUpload] is only required when:
You use fastify-multer (which wraps and parses multipart/form-data for you).

filesUpload is a middleware that parses req.body and req.files before your handler runs.

✅ Since you're using this instead:

const { body, files } = await parseMultipartForm(request);
You're manually reading and handling both file and field parts in your handler.

This gives you full control, better TypeScript support, and no need for extra middleware.

It also gracefully handles optional files (like in your update flow).

🧼 Recommendation
Now that you're all-in on fastify-multipart:

✅ Remove any multer dependencies (fastify-multer, upload.any(), etc.).

✅ Remove all preHandler: [filesUpload] lines.

✅ Prefer your new parseMultipartForm(request) approach everywhere you deal with form + file uploads.


*/