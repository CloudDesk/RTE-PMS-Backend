import { NotificationEvent } from '../models/pms-notification-event.model';
import { emailService } from './email.service';
import { User } from '../models/user.model';
import { Types } from 'mongoose';

import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { TermAssignment } from '../models/pms-term-assignment.model';
import { AnnualDecision } from '../models/pms-annual-decision.model';

export class PmsNotificationService {
  async triggerNotification(
    recipientUserId: string,
    eventType: string,
    channel: 'EMAIL' | 'IN_APP' | 'BOTH',
    subject: string,
    body: string,
    entityType?: string,
    entityId?: string,
    cycleId?: string
  ): Promise<any> {
    const user = await User.findById(recipientUserId).lean();
    if (!user) {
      console.error(`Recipient user ${recipientUserId} not found for notification`);
      return;
    }

    const recipientEmail = user.email;

    // FSD: "do not expose grade/merit in notification before visibility"
    // Clean sanitize subject/body to prevent early leaks of Grade and Merit terms if visibility config is not enabled.
    let gradeVisible = true;
    let meritVisible = true;

    const recipientRole = user.role?.toLowerCase();

    // Admin, Super Admin, and Management can always see grade and merit
    if (recipientRole !== 'admin' && recipientRole !== 'director' && recipientRole !== 'management') {
      let annualAssignment: any = null;

      if (entityType === 'ANNUAL_ASSIGNMENT' && entityId && Types.ObjectId.isValid(entityId)) {
        annualAssignment = await AnnualAssignment.findById(entityId).lean();
      } else if (entityType === 'TERM_ASSIGNMENT' && entityId && Types.ObjectId.isValid(entityId)) {
        const qa = await TermAssignment.findById(entityId).lean();
        if (qa?.annualAssignmentId) {
          annualAssignment = await AnnualAssignment.findById(qa.annualAssignmentId).lean();
        }
      } else if (cycleId && Types.ObjectId.isValid(cycleId)) {
        // FallExp Search
        if (recipientRole === 'employee' || recipientRole === 'staff') {
          annualAssignment = await AnnualAssignment.findOne({
            employeeId: new Types.ObjectId(recipientUserId),
            cycleId: new Types.ObjectId(cycleId),
            isDeleted: false,
          }).lean();
        } else if (recipientRole === 'manager') {
          annualAssignment = await AnnualAssignment.findOne({
            assignedManagerId: new Types.ObjectId(recipientUserId),
            cycleId: new Types.ObjectId(cycleId),
            isDeleted: false,
          }).lean();
        }
      }

      if (annualAssignment) {
        const vis = annualAssignment.visibility ?? {};
        if (recipientRole === 'employee' || recipientRole === 'staff') {
          gradeVisible = vis.employeeGradeVisible === true;
          meritVisible = vis.employeeMeritVisible === true;
        } else if (recipientRole === 'manager') {
          gradeVisible = vis.managerGradeVisible === true;
          meritVisible = vis.managerMeritVisible === true;
        } else {
          gradeVisible = false;
          meritVisible = false;
        }
      } else {
        // Safe default if assignment cannot be resolved
        gradeVisible = false;
        meritVisible = false;
      }
    }

    let sanitizedSubject = subject;
    let sanitizedBody = body;

    // Apply strict sanitization of exact values if resolved
    if (!gradeVisible || !meritVisible) {
      let annualAssignment: any = null;

      if (entityType === 'ANNUAL_ASSIGNMENT' && entityId && Types.ObjectId.isValid(entityId)) {
        annualAssignment = await AnnualAssignment.findById(entityId).lean();
      } else if (entityType === 'TERM_ASSIGNMENT' && entityId && Types.ObjectId.isValid(entityId)) {
        const qa = await TermAssignment.findById(entityId).lean();
        if (qa?.annualAssignmentId) {
          annualAssignment = await AnnualAssignment.findById(qa.annualAssignmentId).lean();
        }
      }

      if (annualAssignment) {
        const decision = await AnnualDecision.findOne({
          annualAssignmentId: annualAssignment._id,
          isDeleted: false,
        }).lean();

        if (decision) {
          if (!gradeVisible) {
            const finalGrade = decision.gradeDetails?.gradeValue ?? decision.gradeDetails?.grade ?? decision.gradeDetails?.finalGrade;
            if (finalGrade) {
              const gradeStr = String(finalGrade);
              const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const regex = new RegExp(`\\b${escapeRegExp(gradeStr)}\\b`, 'gi');
              sanitizedSubject = sanitizedSubject.replace(regex, '[REDACTED]');
              sanitizedBody = sanitizedBody.replace(regex, '[REDACTED]');
            }
            if (decision.finalRating) {
              const regex = new RegExp(`\\b${String(decision.finalRating)}\\b`, 'gi');
              sanitizedSubject = sanitizedSubject.replace(regex, '[REDACTED]');
              sanitizedBody = sanitizedBody.replace(regex, '[REDACTED]');
            }
            if (decision.finalScore !== undefined && decision.finalScore !== null) {
              const regex = new RegExp(`\\b${decision.finalScore}\\b`, 'g');
              sanitizedSubject = sanitizedSubject.replace(regex, '[REDACTED]');
              sanitizedBody = sanitizedBody.replace(regex, '[REDACTED]');
            }
          }

          if (!meritVisible) {
            const meritAmount = decision.meritDetails?.meritAmount;
            if (meritAmount !== undefined && meritAmount !== null) {
              const regex = new RegExp(`\\b${meritAmount}\\b`, 'g');
              sanitizedSubject = sanitizedSubject.replace(regex, '[REDACTED]');
              sanitizedBody = sanitizedBody.replace(regex, '[REDACTED]');
            }
            const meritPercentage = decision.meritDetails?.meritPercentage;
            if (meritPercentage !== undefined && meritPercentage !== null) {
              const regex = new RegExp(`\\b${meritPercentage}%?\\b`, 'g');
              sanitizedSubject = sanitizedSubject.replace(regex, '[REDACTED]');
              sanitizedBody = sanitizedBody.replace(regex, '[REDACTED]');
            }
          }
        }
      }
    }

    // Secondary regex cleanup to hide key phrasing structures
    if (!gradeVisible) {
      sanitizedSubject = sanitizedSubject
        .replace(/\b[Gg]rade\s*:\s*\S+/g, 'Grade: [REDACTED]')
        .replace(/\b[Rr]ating\s*:\s*\S+/g, 'Rating: [REDACTED]')
        .replace(/\b[Ss]core\s*:\s*\d+(\.\d+)?/g, 'Score: [REDACTED]');

      sanitizedBody = sanitizedBody
        .replace(/\b[Gg]rade\s*:\s*\S+/g, 'Grade: [REDACTED]')
        .replace(/\b[Rr]ating\s*:\s*\S+/g, 'Rating: [REDACTED]')
        .replace(/\b[Ss]core\s*:\s*\d+(\.\d+)?/g, 'Score: [REDACTED]');
    }

    if (!meritVisible) {
      sanitizedSubject = sanitizedSubject
        .replace(/\b[Mm]erit\b/gi, '[REDACTED]')
        .replace(/\b[Hh]ike\s*:\s*\d+(\.\d+)?%/gi, 'Hike: [REDACTED]')
        .replace(/\b\d+(\.\d+)?%/g, '[REDACTED]');

      sanitizedBody = sanitizedBody
        .replace(/\b[Mm]erit\b/gi, '[REDACTED]')
        .replace(/\b[Hh]ike\s*:\s*\d+(\.\d+)?%/gi, 'Hike: [REDACTED]')
        .replace(/\b\d+(\.\d+)?%/g, '[REDACTED]');
    }

    const channelsToSend = channel === 'BOTH' ? ['EMAIL', 'IN_APP'] : [channel];
    const results = [];

    for (const ch of channelsToSend) {
      const notificationLog = await NotificationEvent.create({
        eventType,
        recipientUserId: new Types.ObjectId(recipientUserId),
        channel: ch,
        deliveryStatus: 'PENDING',
        entityType,
        entityId: entityId ? new Types.ObjectId(entityId) : undefined,
        cycleId: cycleId ? new Types.ObjectId(cycleId) : undefined,
        payload: { subject: sanitizedSubject, body: sanitizedBody },
      });

      try {
        if (ch === 'EMAIL') {
          if (!recipientEmail) {
            throw new Error('User does not have an email address configured');
          }
          await emailService.sendEmail({
            body: {
              to: recipientEmail,
              subject: sanitizedSubject,
              text: sanitizedBody,
              html: `<div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.5;">${sanitizedBody.replace(/\n/g, '<br>')}</div>`,
            },
          });
        }
        
        notificationLog.deliveryStatus = 'SENT';
        notificationLog.sentAt = new Date();
        await notificationLog.save();
        results.push(notificationLog);
      } catch (err: any) {
        console.error(`Failed to send PMS notification via ${ch}:`, err);
        notificationLog.deliveryStatus = 'FAILED';
        notificationLog.errorMessage = err?.message || 'Unknown delivery failure';
        await notificationLog.save();
        results.push(notificationLog);
      }
    }

    return results;
  }
}

export const pmsNotificationService = new PmsNotificationService();
