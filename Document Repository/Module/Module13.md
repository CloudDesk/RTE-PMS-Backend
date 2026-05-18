Module 13 :: Delegation & Reassignment

Implement PMS v2 Delegation and Reassignment.

ADMIN and SUPER_ADMIN can configure delegation/reassignment.
MANAGER delegate can act only within assigned validity and scope.

Implement:
- delegation model
- reassignment model
- delegation validity period
- acting delegate tracking
- original owner tracking
- manager reassignment
- reassignment reason mandatory
- delegation history
- reassignment history

Rules:
- delegation must not grant global manager access
- delegate can act only within valid date range
- reassignment affects future actions only
- completed quarter manager attribution remains unchanged
- all delegation/reassignment actions audited