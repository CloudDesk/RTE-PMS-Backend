# 📄 FNF Template Variables - Correct Reference

Use these tags in your `FNF_Template.docx` file using **single curly braces `{}`**.

---

### **📋 1. Employee Details**
| Variable | Value Example |
| :--- | :--- |
| `{empNo}` | CD0001 |
| `{empName}` | John Doe |
| `{empDept}` | Engineering |
| `{empDesig}` | Software Engineer |
| `{empLocation}` | Chennai |

---

### **📅 2. Important Dates**
| Variable | Description |
| :--- | :--- |
| `{joiningDate}` | Date of Joining |
| `{resignDate}` | **Submission date of resignation** |
| `{leavingDate}` | Last Working Day |

---

### **📊 3. Days & Service**
| Variable | Value Example |
| :--- | :--- |
| `{noticePeriod}` | 60 |
| `{noticeAdjustable}`| 28 |
| `{plDays}` | 15 |
| `{salaryDays}` | 28 |
| `{monthDays}` | 30 |
| `{lopDays}` | 0 |
| `{effectiveWorkdays}`| 28 |

---

### **💰 4. Earnings (Income)**
Wrap these in Section Tags `{#var}{/var}` if they could be zero.

| Variable Tag to use in Word | Description |
| :--- | :--- |
| `{unpaidBasic}` | Basic + DA (Feb) |
| `{unpaidHRA}` | HRA (Feb) |
| `{unpaidOtherAllowance}` | Other Allowances (Feb) |
| `{holdSalary}` | Jan Salary (on Hold) |
| `{#leaveEncashment} Leave Encashment: {leaveEncashment} {/leaveEncashment}` | Only shows if > 0 |
| `{#reimbursements} Reimbursements: {reimbursements} {/reimbursements}` | Only shows if > 0 |
| `{totalIncome}` | Gross Total |

---

### **💸 5. Deductions (Conditional Lines)**
Wrap these in Section Tags `{#var}{/var}` so they disappear if the value is zero.

| Tag to use in Word |
| :--- |
| `{#pf} Provident Fund: {pf} {/pf}` |
| `{#pt} Professional Tax: {pt} {/pt}` |
| `{#incomeTax} Income Tax (TDS): {incomeTax} {/incomeTax}` |
| `{#noticeRecovery} Notice Period Recovery: {noticeRecovery} {/noticeRecovery}` |
| `{#lopDeduction} LOP Deduction: {lopDeduction} {/lopDeduction}` |
| `{#esi} ESI: {esi} {/esi}` |
| `{#otherDeductions} Other Deductions: {otherDeductions} {/otherDeductions}` |

---

### **💵 6. Net Amount**
| Variable | Value Example |
| :--- | :--- |
| `{netPay}` | ₹21,760.00 |
| `{netPayWords}` | Rupees Twenty One Thousand... |

---

### **📈 7. Dynamic Tables**
If you want the list to auto-populate rows:

**Earnings:**
```text
{#earningsList}
{label}   {amount}
{/earningsList}
```

**Deductions:**
```text
{#deductionsList}
{label}   {amount}
{/deductionsList}
```
