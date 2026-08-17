import { FastifyReply } from 'fastify';
import nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { join } from 'path';
import { config } from '../config';
import axios from 'axios';
import fs from 'fs';



// Define interface for email request body
interface EmailRequestBody {
    to: string | string[];
    cc?: string | string[];
    subject: string;
    text: string;
    html?: string;
}

// Interface for file uploads
interface FileUpload {
    filename: string;
    path?: string;
    mimetype: string;
    encoding: string;
    size: number;
}

// Extending FastifyRequest to include files property
interface EmailRequest {
    body: EmailRequestBody;
    files?: FileUpload[];
}

/**
 * Email Service for RTE-PMS application
 * Handles email sending functionality with optional attachments
 */
export class EmailService {
    private readonly transporter: nodemailer.Transporter;
    private readonly parentDir: string;

    constructor() {
        this.parentDir = process.cwd();
        const port = Number(config.GMAIL_PORT);
        const hasCustomService =
            Boolean(config.GMAIL_SERVICE) &&
            !config.GMAIL_SERVICE.startsWith('default-');
        const transportOptions: SMTPTransport.Options = {
            host: config.GMAIL_HOST,
            port,
            secure: port === 465,
            auth: {
                user: config.GMAIL_AUTH_USER,
                pass: config.GMAIL_AUTH_PASSWORD,
            },
            connectionTimeout: 30000,
            greetingTimeout: 30000,
            socketTimeout: 60000,
            tls: {
                servername: config.GMAIL_HOST,
                minVersion: 'TLSv1.2',
                rejectUnauthorized: config.GMAIL_TLS_REJECT_UNAUTHORIZED,
            },
        };

        if (hasCustomService) {
            transportOptions.service = config.GMAIL_SERVICE;
        }

        // Initialize nodemailer transporter with env variables
        this.transporter = nodemailer.createTransport(transportOptions);
    }

    private getMailErrorMessage(error: any): string {
        if (error?.code === 'ETIMEDOUT' || /timeout/i.test(error?.message || '')) {
            return 'Connection timeout';
        }

        return error?.message || 'Unknown email error';
    }

    public async sendEmail(request: EmailRequest, reply?: FastifyReply): Promise<string> {
        try {
            const { to, cc, subject, text, html } = request.body;

            // Configure mail options
            const mailOptions: nodemailer.SendMailOptions = {
                from: `"RTE-PMS" <${config.GMAIL_AUTH_USER}>`,
                to,
                cc,
                subject,
                text,
                html
            };

            // Add attachments if files are present
            if (request.files && request.files.length > 0) {
                mailOptions.attachments = request.files.map((file) => {
                    // Safety logic to support new absolute paths, local uploads, and legacy parent-folder uploads
                    let filepath = file.path || join(this.parentDir, "uploads", file.filename);

                    if (!file.path && !fs.existsSync(filepath)) {
                        const legacyPath = join(this.parentDir, "../uploads", file.filename);
                        if (fs.existsSync(legacyPath)) {
                            filepath = legacyPath;
                        }
                    }

                    return { filename: file.filename, path: filepath };
                });
            }

            // Send email and return result
            const info = await this.transporter.sendMail(mailOptions);

            if (reply) {
                return reply.send({
                    success: true,
                    message: "Email sent successfully",
                    messageId: info.messageId
                });
            }

            return "Email sent successfully";
        } catch (error: any) {
            console.error('Error sending email:', error);
            const message = this.getMailErrorMessage(error);

            if (reply) {
                return reply.status(500).send({
                    success: false,
                    message: "Error sending email",
                    error: message
                });
            }

            throw new Error(`Failed to send email: ${message}`);
        }
    }
    public async fetchPdfBuffer(url: string): Promise<Buffer> {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 30000,
            maxContentLength: 25 * 1024 * 1024,
            maxBodyLength: 25 * 1024 * 1024,
        });
        return Buffer.from(response.data);
    }
    public async sendPayslipEmails(
        month: number,
        year: number,
        payslips: Array<{
            employeeId: string;
            employeeName: string;
            email: string;
            payslipId: string;
            payslipUrl: string;
        }>,
        recipients: string[]
    ): Promise<{ success: boolean; message: string; results?: any[] }> {
        try {
            console.log("sendPayslipEmails", month, year);
            console.log("sendPayslipEmails", payslips)
            // Filter payslips based on selected recipients
            const selectedPayslips = payslips.filter(payslip =>
                recipients.includes(payslip.employeeId)
            );
            console.log(selectedPayslips, "selectedPayslips")
            if (selectedPayslips.length === 0) {
                return {
                    success: false,
                    message: "No matching payslips found for selected recipients"
                };
            }

            // Send individual emails to each recipient
            const results = [];
            for (const payslip of selectedPayslips) {
                const pdfBuffer = await this.fetchPdfBuffer(payslip.payslipUrl);
                console.log(pdfBuffer, "pdfBuffer service");
                const mailOptions: nodemailer.SendMailOptions = {
                    from: `"RTE-PMS" <${config.GMAIL_AUTH_USER}>`,
                    to: payslip.email,
                    subject: `Your Payslip for ${month} ${year}`,
                    html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee;">
                <h2 style="color: #333;">RTE-PMS Payslip</h2>
                <p>Dear ${payslip.employeeName},</p>
                <p>Your payslip for ${month} ${year} is now available. Please find it attached.</p>
                <p>If you have any questions, please contact the HR department.</p>
                <p>Thank you,</p>
                <p>HR Team</p>
              </div>
            `,
                    attachments: [
                        {
                            filename: `Payslip_${payslip.employeeName}_${month}_${year}.pdf`,
                            content: pdfBuffer,
                            contentType: 'application/pdf',
                            contentDisposition: 'attachment'
                        }
                    ]
                };

                const info = await this.transporter.sendMail(mailOptions);
                results.push(info);
            }
            console.log(results, "results sendPayslipEmails")
            return {
                success: true,
                message: `Successfully sent ${results.length} payslip emails`,
                results
            };
        } catch (error: any) {
            console.error('Error sending payslip emails:', error);
            throw new Error(`Failed to send payslip emails: ${this.getMailErrorMessage(error)}`);
        }
    }

}

export const emailService = new EmailService();
