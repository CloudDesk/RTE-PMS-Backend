# GCP Cloud Storage Setup Guide

## Environment Variables

Add the following environment variable to your `.env` file:

```bash
GCP_BUCKET_NAME=tendly-documents
```

## GCP Bucket Creation

1. Go to Google Cloud Console
2. Navigate to Cloud Storage > Buckets
3. Create a new bucket with the name: `tendly-documents`
4. Set the following configuration:
   - **Location type**: Region
   - **Location**: Choose your preferred region (e.g., us-central1)
   - **Storage class**: Standard
   - **Access control**: Uniform
   - **Protection tools**: None (for now)

## Service Account Setup

1. Go to IAM & Admin > Service Accounts
2. Create a new service account or use existing one
3. Assign the following roles:
   - **Storage Object Admin** (for full access to bucket)
   - **Storage Object Viewer** (for read access)
4. Create and download the JSON key file
5. Set the environment variable:
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/service-account-key.json
   ```

## Folder Structure

The system will automatically create the following folder structure in your GCP bucket:

```
tendly-documents/
├── {employeeId}/
│   ├── Certificate/
│   │   └── Doc_Certificate_*.pdf
│   ├── TimesheetFile/
│   │   └── Doc_Timesheet_*.xlsx
│   ├── Form16/
│   │   └── Doc_Form16_*.pdf
│   ├── Form12B/
│   │   └── Doc_Form12B_*.pdf
│   ├── Form12BB/
│   │   └── form12bb_*.pdf
│   ├── Payroll/
│   │   └── Doc_Payslip_*.pdf
│   ├── OfferLetter/
│   │   └── Doc_OfferLetter_*.pdf
│   └── HikeLetter/
│       └── Doc_HikeLetter_*.pdf
```

## File Access

All files uploaded to GCP will be publicly accessible via URLs like:
```
https://storage.googleapis.com/tendly-documents/{employeeId}/{folderName}/{fileName}
```

## Security Considerations

- Files are made public for easy access
- Consider implementing signed URLs for better security
- Monitor bucket access logs
- Set up lifecycle policies for old files if needed

## Testing

After setup, test the integration by:
1. Creating a certificate document
2. Checking if the file appears in the correct GCP folder
3. Verifying the file URL is accessible 