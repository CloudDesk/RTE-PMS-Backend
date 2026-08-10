import { FastifyReply, FastifyRequest } from "fastify";
import "@fastify/cookie";
import "@fastify/jwt";
import { Types } from "mongoose";
import { ServiceContainer } from "../types/container";
import { RequestContext } from "../types/context";
import { Container } from "../container";
import { User } from "../models";
import * as crypto from "crypto";

interface JWTPayload {
  _id: string;
  email: string;
  name: string;
  role: string;
  departmentId: string;
  active: boolean;
  // New fields for UAE + external user support
  country: string;
  currency: string;
  licenseType: string;
  portalAccess: boolean;
  scope?: string;
  priority?: number;
  managerId?: string;
  managerName?: string;
}

interface RequestWithCookies extends FastifyRequest {
  cookies: {
    access_token?: string;
  };
  container?: ServiceContainer;
}

const isValidObjectId = (id: string): boolean => {
  return Types.ObjectId.isValid(id) && String(new Types.ObjectId(id)) === id;
};

const getPmsCurrentDateOverride = (request: FastifyRequest): Date | undefined => {
  const rawHeader = request.headers["x-pms-current-date"];
  const rawValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (!rawValue) return undefined;

  const value = String(rawValue).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;

  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

export const authenticate = async (
  request: RequestWithCookies,
  reply: FastifyReply
): Promise<void> => {
  try {
    // Check for WhatsApp authentication first (signature/secret in headers)
    const whatsappSignature = request.headers["x-whatsapp-signature"] as string;
    const whatsappSecret = request.headers["x-whatsapp-secret"] as string;
    const hasWhatsAppAuth = whatsappSignature || whatsappSecret;

    if (hasWhatsAppAuth) {
      // WhatsApp authentication flow
      // Check both body (POST) and query (GET) for phoneNumber
      const phoneNumber =
        (request.body as any)?.phoneNumber ||
        (request.query as any)?.phoneNumber;
      const timestamp = request.headers["x-whatsapp-timestamp"] as string;

      if (!phoneNumber) {
        throw new Error("Phone number is required for WhatsApp authentication");
      }

      // Get FACEBOOK_APP_SECRET from environment
      const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
      if (!FACEBOOK_APP_SECRET) {
        throw new Error("FACEBOOK_APP_SECRET not configured");
      }

      // Verify authentication
      let isVerified = false;

      if (whatsappSecret) {
        // Method 1: Direct secret comparison
        if (whatsappSecret === FACEBOOK_APP_SECRET) {
          isVerified = true;
        }
      } else if (whatsappSignature && timestamp) {
        // Method 2: Signature verification
        const currentTime = Math.floor(Date.now() / 1000);
        const requestTime = parseInt(timestamp);

        if (currentTime - requestTime > 300) {
          throw new Error("Request timestamp expired");
        }

        const expectedSignature = crypto
          .createHmac("sha256", FACEBOOK_APP_SECRET)
          .update(phoneNumber + timestamp)
          .digest("hex");

        if (whatsappSignature === expectedSignature) {
          isVerified = true;
        }
      }

      if (!isVerified) {
        throw new Error("Invalid WhatsApp authentication credentials");
      }

      // Normalize phone number
      const normalizedPhone = phoneNumber.replace(/[\s\-\(\)]/g, "");
      
      console.log("🔍 WhatsApp Auth - Looking for user with phone:", normalizedPhone);

      // Try multiple phone formats (with/without country code)
      const phoneVariants = [
        normalizedPhone,                                          // As provided
        normalizedPhone.replace(/^\+91/, ""),                    // Remove +91 if present
        normalizedPhone.replace(/^\+/, ""),                      // Remove any + prefix
        normalizedPhone.startsWith("+") ? normalizedPhone : `+91${normalizedPhone}`, // Add +91
      ];
      
      // Remove duplicates
      const uniquePhoneVariants = [...new Set(phoneVariants)];
      console.log("🔍 WhatsApp Auth - Trying phone variants:", uniquePhoneVariants);

      // Find user by any phone variant
      let user = null;
      for (const phoneVariant of uniquePhoneVariants) {
        user = await User.findOne({
          phone: phoneVariant,
          active: true,
        }).select(
          "_id email name role departmentId active country currency licenseType portalAccess"
        );
        
        if (user) {
          console.log("✅ WhatsApp Auth - User found with phone:", phoneVariant, `(${user.email})`);
          break;
        }
      }

      if (!user) {
        console.log("❌ WhatsApp Auth - User not found for any variant");
        throw new Error(`User not found or inactive for phone: ${normalizedPhone}`);
      }

      if (user.portalAccess === false) {
        throw new Error("User does not have portal access");
      }

      // Create user context (treat missing portalAccess as portal for existing users)
      const userContext = {
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        departmentId: user.departmentId,
        active: user.active,
        country: user.country,
        currency: user.currency,
        licenseType: user.licenseType,
        portalAccess: (user.portalAccess as boolean | undefined) !== false,
      };

      request.user = userContext;

      // Update container context
      if (request.container) {
        const container = Container.getInstance();
        const updatedContext: RequestContext = {
          requestId: request.id,
          user: userContext,
          reqRole: user.role.toUpperCase(),
          pmsCurrentDate: getPmsCurrentDateOverride(request),
        };
        container.clearScope(request.id);
        request.container = container.createScope(request.id, updatedContext);
      }

      console.log("WhatsApp authentication successful for:", normalizedPhone);
      return; // Exit early for WhatsApp auth
    }

    // JWT authentication flow (existing)
    const token = request.cookies?.access_token;
    console.log(token, "Token ß");
    if (!token) {
      throw new Error("No token provided");
    }

    try {
      // Verify token manually since we're using cookies
      const decoded = await request.server.jwt.verify<JWTPayload>(token);

      // Validate ObjectIds
      if (!isValidObjectId(decoded._id)) {
        throw new Error("Invalid user ID format");
      }

      const user = {
        _id: new Types.ObjectId(decoded._id),
        email: decoded.email,
        name: decoded.name,
        role: decoded.role,
        departmentId: decoded.departmentId,
        active: decoded.active,
        // New fields for UAE + external user support
        country: decoded.country,
        currency: decoded.currency,
        licenseType: decoded.licenseType,
        portalAccess: decoded.portalAccess,
        scope: decoded.scope,
      };

      // Set user in request for compatibility
      request.user = user;

      // Update container context
      if (request.container) {
        const container = Container.getInstance();
        const updatedContext: RequestContext = {
          requestId: request.id,
          user,
          reqRole: decoded.role.toUpperCase(),
          pmsCurrentDate: getPmsCurrentDateOverride(request),
        };
        // Clear and recreate the scope with updated context
        container.clearScope(request.id);
        request.container = container.createScope(request.id, updatedContext);
      }

      // Check if user is active
      if (!decoded.active) {
        throw new Error("User account is inactive");
      }

      // Check if user has portal access
      if (decoded.portalAccess === false) {
        throw new Error("User does not have portal access");
      }

      console.log("Final in Authß");
    } catch (jwtError: any) {
      console.error("Authentication error:", jwtError.message);
      throw new Error(jwtError.message || "Invalid token");
    }
  } catch (err: any) {
    reply.status(401).send({
      success: false,
      error: {
        message: err.message || "Authentication failed",
      },
    });
  }
};
