Module 12 :: SLA & Notification

Implement PMS v2 SLA and Notification Management.

ADMIN and SUPER_ADMIN can configure SLA/reminder rules.
System sends reminders and escalation notifications.

Implement:
- SLA rule model
- reminder rule model
- notification model
- due date calculation
- relative offset calculation
- overdue detection
- event notification
- pre-due reminder
- due-date reminder
- overdue reminder
- escalation notification
- notification failure logging

Notification events:
cycle launch
objective window open
objective submission pending
objective approval pending
objective returned
quarter review pending
quarter review overdue
annual appraisal window open
final decision frozen
visibility enabled
communication sent
reopen initiated

Rules:
- escalation is notification-only
- escalation must not auto-progress workflow
- do not restart SLA automatically after reopen
- do not expose grade/merit in notification before visibility
- do not implement automated retry unless explicitly approved