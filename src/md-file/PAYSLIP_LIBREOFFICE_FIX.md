# Payslip Generation Error Fix - LibreOffice Installation Guide

**Error:** "Could not find soffice binary"  
**Cause:** LibreOffice is not installed on your system  
**Status:** Required for DOCX to PDF conversion

---

## 🔧 **SOLUTIONS**

### **Solution 1: Install LibreOffice (Quick Fix - Windows)**

#### **Step 1: Download LibreOffice**

1. Visit: https://www.libreoffice.org/download/download/
2. Download the Windows version (stable release)
3. Install with default settings

#### **Step 2: Add to System PATH**

1. Find LibreOffice installation path (usually `C:\Program Files\LibreOffice\program`)
2. Add to Windows PATH:
   - Open System Properties → Environment Variables
   - Edit "Path" variable
   - Add: `C:\Program Files\LibreOffice\program`
   - Click OK

#### **Step 3: Verify Installation**

```bash
# Open new terminal and run:
soffice --version
```

#### **Step 4: Restart Your Server**

```bash
npm run dev
```

---

### **Solution 2: Use Docker (Recommended for Production-like Environment)**

LibreOffice is already configured in the Dockerfile. Run the app in Docker:

#### **Build and Run:**

```bash
# Build Docker image
docker build -t tendly-hrms .

# Run container
docker run -p 5800:5800 --env-file .env tendly-hrms
```

---

### **Solution 3: Use Cloud Run (Already Has LibreOffice)**

Deploy to GCP Cloud Run where LibreOffice is pre-installed:

```bash
npm run hrms-build
npm run hrms-tag
npm run hrms-push
npm run hrms-deploy
```

---

### **Solution 4: Alternative - Use Puppeteer Instead (Code Change)**

If you can't install LibreOffice, modify the code to use Puppeteer (already in your dependencies):

**Pros:**

- No additional installation required
- Already in package.json
- Better HTML to PDF conversion

**Cons:**

- Requires code changes
- Different from current DOCX template approach

---

## 🎯 **Recommended Approach**

### **For Local Development:**

- **Option 1:** Install LibreOffice (easiest)
- **Option 2:** Run in Docker

### **For Production:**

- Use Cloud Run (LibreOffice already configured in Dockerfile)

---

## 🧪 **Test After Installation**

### **1. Check LibreOffice:**

```bash
# Windows
soffice --version

# Linux/Mac (in Docker)
libreoffice --version
```

### **2. Test Payslip Generation:**

```bash
# Make API request
curl -X POST "http://localhost:5800/payslip/generate-bulk" \
  -H "Content-Type: application/json" \
  -H "Cookie: access_token=YOUR_TOKEN" \
  -d '{
    "userIds": ["68da6b10d3bbedacfb6c0efc"],
    "month": 10,
    "year": 2025
  }'
```

---

## 📋 **Quick Install Commands**

### **Windows (Using Chocolatey):**

```powershell
choco install libreoffice
```

### **Windows (Using winget):**

```powershell
winget install --id TheDocumentFoundation.LibreOffice
```

### **Linux (Ubuntu/Debian):**

```bash
sudo apt-get update
sudo apt-get install -y libreoffice
```

### **macOS:**

```bash
brew install --cask libreoffice
```

---

## ❓ **Troubleshooting**

### **Issue 1: "soffice not found" after installation**

**Solution:** Add LibreOffice to PATH and restart terminal

### **Issue 2: "Permission denied"**

**Solution:** Run terminal as Administrator (Windows) or use sudo (Linux/Mac)

### **Issue 3: Still getting error after installation**

**Solution:**

1. Restart your Node.js server
2. Verify PATH configuration
3. Check LibreOffice installation location

---

## 🔍 **Verification Checklist**

- [ ] LibreOffice installed
- [ ] `soffice` command works in terminal
- [ ] PATH variable updated (Windows)
- [ ] Server restarted
- [ ] Test payslip generation successful

---

## 📞 **Additional Help**

If you continue to face issues:

1. **Check Dockerfile Configuration:**

   - File: `Dockerfile` (line 5)
   - LibreOffice is pre-configured for Docker

2. **Check Code Implementation:**

   - File: `src/services/payslip.service.ts` (lines 528-551)
   - Uses `libreoffice-convert` package

3. **Environment:**
   - Local: Requires manual LibreOffice installation
   - Docker: LibreOffice pre-installed
   - Cloud Run: LibreOffice pre-installed

---

## ✅ **Quick Fix Summary**

### **For Windows Local Development:**

```bash
# 1. Install LibreOffice
winget install --id TheDocumentFoundation.LibreOffice

# 2. Add to PATH
# C:\Program Files\LibreOffice\program

# 3. Restart terminal and server
npm run dev

# 4. Test payslip generation
```

### **For Docker (Easiest):**

```bash
# Build and run
docker build -t tendly-hrms .
docker run -p 5800:5800 --env-file .env tendly-hrms
```

---

**Last Updated:** October 8, 2025  
**Issue:** LibreOffice Binary Not Found  
**Impact:** Payslip PDF generation fails  
**Priority:** High
