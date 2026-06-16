import { IUser, User } from '../models';
import * as argon2 from 'argon2';
import crypto from 'crypto';
import { emailService } from './email.service';
import { generateEmailTemplate } from '../emails/templates';

export class AuthService {
  async login(email: string, password: string) {
    // Only allow login for users with portal access (payroll-only duplicate-email users cannot log in).
    // Treat missing/undefined portalAccess as portal (existing users created before field existed).
    const user = await User.findOne({ email: email.toLowerCase().trim(), active: true, portalAccess: { $ne: false } }).select('+password');
    console.log('User Found', user);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    if (!user.active) {
      throw new Error('Account is inactive');
    }

    // Only reject when explicitly no portal access (treat missing/undefined as portal for existing users)
    if (user.portalAccess === false) {
      throw new Error('User does not have portal access');
    }

    console.log(user.password, 'Stored Hashed Password from DB');
    console.log(password, 'Plaintext Password Input');
    // let isValidPassword = await argon2.verify(user.password, password);
    // console.log(isValidPassword, 'Password Verification Result');

    try {
      let isValidPassword = await argon2.verify(user.password, password.trim());
      console.log(isValidPassword, 'Password Verification Result');
      if (!isValidPassword) {
        throw new Error('Invalid email or password');
      }
    } catch (err) {
      console.error('Argon2 verification error:', err);
      throw new Error('Invalid email or password');
    }



    return user;
  }



  async forgotPassword(email: string) {
    console.log(email.length,"length");
    console.log(email," forgot password email");
    // Treat missing/undefined portalAccess as portal (existing users created before field existed).
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+resetToken +resetTokenExpiry');
    if (!user) {
      throw new Error('User not found');
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes expiry

    user.resetToken = resetToken;
    user.resetTokenExpiry = resetTokenExpiry;
    await user.save();

    // Send email with reset link
    await this.sendPasswordResetEmail(email, resetToken, user);

    // For now, just return the token for testing
    return true;
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await User.findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: new Date() }
    }).select('+resetToken +resetTokenExpiry +password');
    console.log("resetPassword token", token);
    console.log("resetPassword newPassword", newPassword)

    if (!user) {
      throw new Error('Invalid or expired reset token');
    }
    console.log(user, "user resetPassword")
    // // Hash the new password
    // const hashedPassword = await argon2.hash(newPassword);
    // Don't hash manually - just set the plain password
    // The pre-save hook will hash it automatically
    user.password = newPassword;
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();
    console.log("password reset successfully", user.password)

    return true;
  }
  async validateResetToken(token: string) {
    const user = await User.findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: new Date() }
    });

    if (!user) {
      throw new Error('Invalid or expired reset token');
    }

    return true;
  }

  private async sendPasswordResetEmail(email: string, resetToken: string, user: IUser) {
    try {
      // Application URL - adjust based on your environment
      const appUrl = process.env.APP_URL || 'http://localhost:5173';

      // Generate reset URL with query parameters
      // const resetUrl = `${appUrl}/login?view=reset-password&token=${resetToken}`;

      const htmlContent = generateEmailTemplate('passwordResetEmail', {
        userName: user.name,
        companyName: 'CloudDesk HRMS',
        resetUrl: `${appUrl}/login?view=reset-password&token=${resetToken}`,
        expiryMinutes: 2
      });

      // Prepare the email content
      const emailRequest = {
        body: {
          to: email,
          subject: 'Reset Your HRMS Password',
          text: `Hi ${user.name},\n\nYou requested a password reset.\nReset your password using the following link:\n${appUrl}/login?view=reset-password&token=${resetToken}\n\nThis link expires in 2 minutes.`,
          html: htmlContent
        }
      };

      // Send the email using your email service
      await emailService.sendEmail(emailRequest);

      return true;
    }
    catch (error) {
      console.error('Error sending password reset email:', error);
      return true;
    }

  }
} 