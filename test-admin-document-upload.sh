#!/bin/bash

# Admin Document Upload - Test Script
# This script tests the new admin document upload feature

BASE_URL="${BASE_URL:-http://localhost:5800}"
TOKEN="${AUTH_TOKEN:-YOUR_TOKEN_HERE}"

echo "=================================================="
echo "  Admin Document Upload - Test Script"
echo "=================================================="
echo ""
echo "Base URL: $BASE_URL"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Upload a Payslip
echo -e "${YELLOW}Test 1: Upload Payslip Document${NC}"
echo "-----------------------------------"

# Create a sample PDF file for testing
echo "Sample Payslip Content" > /tmp/test_payslip.pdf

response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/documents/admin/upload" \
  -H "Cookie: access_token=$TOKEN" \
  -F "employeeId=507f1f77bcf86cd799439011" \
  -F "documentType=Payslip" \
  -F "month=10" \
  -F "year=2025" \
  -F "description=Test payslip upload" \
  -F "file=@/tmp/test_payslip.pdf")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "200" ]; then
    echo -e "${GREEN}✓ PASS${NC} - Payslip uploaded successfully"
    echo "Response: $body"
else
    echo -e "${RED}✗ FAIL${NC} - HTTP Code: $http_code"
    echo "Response: $body"
fi

echo ""

# Test 2: Upload a Timesheet
echo -e "${YELLOW}Test 2: Upload Timesheet Document${NC}"
echo "-----------------------------------"

# Create a sample Excel file for testing
echo "Sample Timesheet Content" > /tmp/test_timesheet.xlsx

response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/documents/admin/upload" \
  -H "Cookie: access_token=$TOKEN" \
  -F "employeeId=507f1f77bcf86cd799439011" \
  -F "documentType=Timesheet" \
  -F "month=9" \
  -F "year=2025" \
  -F "file=@/tmp/test_timesheet.xlsx")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "200" ]; then
    echo -e "${GREEN}✓ PASS${NC} - Timesheet uploaded successfully"
    echo "Response: $body"
else
    echo -e "${RED}✗ FAIL${NC} - HTTP Code: $http_code"
    echo "Response: $body"
fi

echo ""

# Test 3: Get All Admin Uploads
echo -e "${YELLOW}Test 3: Get All Admin Uploaded Documents${NC}"
echo "-----------------------------------"

response=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/documents/admin/uploads?page=1&limit=10" \
  -H "Cookie: access_token=$TOKEN")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "200" ]; then
    echo -e "${GREEN}✓ PASS${NC} - Documents retrieved successfully"
    echo "Response: $body"
else
    echo -e "${RED}✗ FAIL${NC} - HTTP Code: $http_code"
    echo "Response: $body"
fi

echo ""

# Test 4: Get Filtered Documents (Payslips only)
echo -e "${YELLOW}Test 4: Get Payslips for 2025${NC}"
echo "-----------------------------------"

response=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/documents/admin/uploads?documentType=Payslip&year=2025" \
  -H "Cookie: access_token=$TOKEN")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "200" ]; then
    echo -e "${GREEN}✓ PASS${NC} - Filtered payslips retrieved"
    echo "Response: $body"
else
    echo -e "${RED}✗ FAIL${NC} - HTTP Code: $http_code"
    echo "Response: $body"
fi

echo ""

# Test 5: Validation - Missing File
echo -e "${YELLOW}Test 5: Validation - Missing File${NC}"
echo "-----------------------------------"

response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/documents/admin/upload" \
  -H "Cookie: access_token=$TOKEN" \
  -F "employeeId=507f1f77bcf86cd799439011" \
  -F "documentType=Payslip" \
  -F "month=10" \
  -F "year=2025")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "400" ]; then
    echo -e "${GREEN}✓ PASS${NC} - Validation working (expected 400)"
    echo "Response: $body"
else
    echo -e "${RED}✗ FAIL${NC} - Expected 400, got: $http_code"
    echo "Response: $body"
fi

echo ""

# Test 6: Validation - Invalid Month
echo -e "${YELLOW}Test 6: Validation - Invalid Month${NC}"
echo "-----------------------------------"

echo "Sample File" > /tmp/test_invalid.pdf

response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/documents/admin/upload" \
  -H "Cookie: access_token=$TOKEN" \
  -F "employeeId=507f1f77bcf86cd799439011" \
  -F "documentType=Payslip" \
  -F "month=13" \
  -F "year=2025" \
  -F "file=@/tmp/test_invalid.pdf")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "400" ]; then
    echo -e "${GREEN}✓ PASS${NC} - Month validation working (expected 400)"
    echo "Response: $body"
else
    echo -e "${RED}✗ FAIL${NC} - Expected 400, got: $http_code"
    echo "Response: $body"
fi

echo ""

# Test 7: Existing Functionality - Get All Documents
echo -e "${YELLOW}Test 7: Existing Functionality - Get All Documents${NC}"
echo "-----------------------------------"

response=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/documents?access=global&page=1&limit=10" \
  -H "Cookie: access_token=$TOKEN")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "200" ]; then
    echo -e "${GREEN}✓ PASS${NC} - Existing documents endpoint still working"
    echo "Response: $body"
else
    echo -e "${RED}✗ FAIL${NC} - HTTP Code: $http_code"
    echo "Response: $body"
fi

echo ""

# Cleanup
rm -f /tmp/test_payslip.pdf /tmp/test_timesheet.xlsx /tmp/test_invalid.pdf

echo "=================================================="
echo "  Test Summary"
echo "=================================================="
echo ""
echo "All tests completed. Review results above."
echo ""
echo "Note: Replace YOUR_TOKEN_HERE with actual auth token"
echo "      and 507f1f77bcf86cd799439011 with real employee ID"
echo ""

