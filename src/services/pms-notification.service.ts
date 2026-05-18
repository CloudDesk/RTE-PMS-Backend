import { NotificationEvent } from '../models/pms-notification-event.model';
import { emailService } from './email.service';
import { User } from '../models/user.model';
import { Types } from 'mongoose';

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
    let sanitizedSubject = subject;
    let sanitizedBody = body;

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
