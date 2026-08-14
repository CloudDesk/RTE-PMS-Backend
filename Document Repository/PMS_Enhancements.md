# PMS Enhancement Requirements

## 1. Dashboard

- Display the current cycle status.
- Show pending users who have not completed their assigned activities.
- Include pending activities for both employees and managers.

## 2. Trainee Employee

- Introduce a separate **Trainee Employee** tab.
- Display only trainee employees in this tab.
- Remove trainee employees from the regular **Employee** page.
- Allow HR users to select and manage the **L2** mapping.

## 3. Employee Manager Mapping

- Allow HR users to select and manage the **L2** and **L3** mappings.

## 4. HR Login

HR users will manage the following areas:

- Employee Management
- Template Management
- Cycle Creation
- Template Training Identification
- Trainee Assignments

## 5. QS Login

- Allow QS users to create and manage the Objective Library, including:
  - Company Objectives
  - Department Objectives
  - Cell Objectives
- Do not display employees' filled objective values in the QS portal.

## 6. Company Objectives

- No functional changes are required.
- Filled objective values must remain visible only to:
  - The assigned employee
  - The employee's manager

## 7. Roles and Responsibilities

- Allow employees to add their Roles and Responsibilities through the employee portal.
- Make the entered details visible to the employee's manager and HR.

## 8. User Portal

### 8.1 My Objectives

- Display all objectives assigned to the employee, including:
  - Employee-created and approved objectives
  - Manager-created objectives
- Map each objective to its respective metrics.

### 8.2 Objective Achievement

- Continue the existing objective-achievement functionality.
- Introduce a new screen for quarterly or term-based achievement updates.

### 8.3 Performance Filling

- Allow employees to fill in and update their performance within the configured cycle window.
- Introduce a new screen for performance filling and updates.

### 8.4 Achievement Submission

- Continue the existing submission logic based on the configured timeline.
- Introduce a new screen for achievement submission.

## 9. Template

- Support ordering of template formats.
- Display past progression details within the template.

## 10. Annual Decision and Review Workflow

- Based on the Annual Decision:
  - Create a new progression record.
  - Move the current progression record to history.
- The Admin will not handle the Annual Decision.
- Employees will submit their objectives for every assigned quarter or term.
- The annual review and decision workflow will follow this sequence:
  1. **L1 (Manager)** performs the yearly review.
  2. **L2** completes their review after L1.
  3. **L3** completes their review after L2.
  4. **L3** makes the final Annual Decision.
- The final Annual Decision by L3 will include:
  - Merit/Grade
  - Annual Decision
  - Visibility Control
- L1 will be able to view:
  - Values entered by L2
  - Values entered by L3
  - The final Annual Decision made by L3
