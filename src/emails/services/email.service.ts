import { FastifyReply } from 'fastify';
import nodemailer from 'nodemailer';
import { join } from 'path';
import { config } from '../../config';
import axios from 'axios';



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

const GMAIL_SERVICE = "gmail"
const GMAIL_HOST = "smtp.gmail.com"
const GMAIL_PORT = 465
const GMAIL_AUTH_USER = "cdmacdev3@gmail.com"
const GMAIL_AUTH_PASSWORD = "eydc luki mzft dfyb"

/**
 * Email Service for Zuno HR application
 * Handles email sending functionality with optional attachments
 */
export class EmailService {
    private readonly transporter: nodemailer.Transporter;
    private readonly parentDir: string;

    constructor() {
        this.parentDir = process.cwd();


        // Initialize nodemailer transporter with env variables
        this.transporter = nodemailer.createTransport({
            service: GMAIL_SERVICE,
            host: GMAIL_HOST,
            port: Number(GMAIL_PORT),
            secure: true,
            auth: {
                user: GMAIL_AUTH_USER,
                pass: GMAIL_AUTH_PASSWORD,
            },
        });
    }

    public async sendEmail(request: EmailRequest, reply?: FastifyReply): Promise<string> {
        try {
            const { to, cc, subject, text, html } = request.body;

            // Configure mail options
            const mailOptions: nodemailer.SendMailOptions = {
                from: `"Zuno HR" <${GMAIL_AUTH_USER}>`,
                to,
                cc,
                subject,
                text,
                html
            };

            // Add attachments if files are present
            if (request.files && request.files.length > 0) {
                mailOptions.attachments = request.files.map((file) => {
                    const filepath = join(this.parentDir, "../uploads", file.filename);
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

            if (reply) {
                return reply.status(500).send({
                    success: false,
                    message: "Error sending email",
                    error: error.message
                });
            }

            throw new Error(`Failed to send email: ${error.message}`);
        }
    }
    public async fetchPdfBuffer(url: string): Promise<Buffer> {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
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
            const emailPromises = selectedPayslips.map(async (payslip) => {

                const pdfBuffer = await this.fetchPdfBuffer(payslip.payslipUrl);
console.log(pdfBuffer, "pdfBuffer ==>  ");
                const mailOptions: nodemailer.SendMailOptions = {
                    from: `"Zuno HR" <${config.GMAIL_AUTH_USER}>`,
                    to: payslip.email,
                    subject: `Your Payslip for ${month} ${year}`,
                    html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee;">
                <h2 style="color: #333;">Zuno HR Payslip</h2>
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

                return this.transporter.sendMail(mailOptions);
            });
            console.log(emailPromises, "emailPromises")
            const results = await Promise.all(emailPromises);
            console.log(results, "results sendPayslipEmails")
            return {
                success: true,
                message: `Successfully sent ${results.length} payslip emails`,
                results
            };
        } catch (error: any) {
            console.error('Error sending payslip emails:', error);
            throw new Error(`Failed to send payslip emails: ${error.message}`);
        }
    }

}

export const emailService = new EmailService();