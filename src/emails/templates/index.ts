import fs from 'fs';
import path from 'path';
import handlebars from 'handlebars';

// Register Handlebars helpers
handlebars.registerHelper('eq', function(a: any, b: any) {
    return a === b;
});

interface TemplateParams {
    [key: string]: string | number | boolean;
}

export function generateEmailTemplate(templateName: string, params: TemplateParams) {
    // Handle both development and production paths
    let filePath = path.join(__dirname, '../templates', `${templateName}.hbs`);
    
    // If file doesn't exist in current directory, try the source directory
    if (!fs.existsSync(filePath)) {
        filePath = path.join(__dirname, '../../src/emails/templates', `${templateName}.hbs`);
    }
    
    // If still doesn't exist, try the dist directory
    if (!fs.existsSync(filePath)) {
        filePath = path.join(__dirname, '../templates', `${templateName}.hbs`);
    }
    
    if (!fs.existsSync(filePath)) {
        throw new Error(`Template file not found: ${templateName}.hbs`);
    }
    
    const source = fs.readFileSync(filePath, 'utf8');
    const template = handlebars.compile(source);
    return template(params);
}
