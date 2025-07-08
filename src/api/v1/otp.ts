import { Router, Request, Response, NextFunction } from "express";
import { Resend } from "resend";

import bcrypt from "bcryptjs";
import { OTPResponse, SendOTPRequest, VerifyOTPRequest } from "../../types/otp";
import { prisma } from "../../lib/prisma";
import { authenticateToken, generateAccessToken, generateRefreshToken, otpStorage, verifyRefreshToken } from "../../lib/auth";

const router = Router();
const resend = new Resend(process.env.RESEND_API_KEY);

// JWT Configuration


// Helper functions
const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Database helper functions
const getUserByEmail = async (email: string) => {
  return await prisma.user.findUnique({
    where: { email },
  });
};

const createNewUser = async (email: string) => {
  return await prisma.user.create({
    data: {
      email,
      verified: false,
      isNewUser: true,
      onboardingCompleted: false,
      lastLoginAt: new Date(),
    },
  });
};

const updateUser = async (userId: string, updates: any) => {
  return await prisma.user.update({
    where: { id: userId },
    data: {
      ...updates,
      updatedAt: new Date(),
    },
  });
};

// Email sending function (keep your existing implementation)
const sendOTPEmail = async (
  email: string,
  otp: string,
  isNewUser: boolean
): Promise<boolean> => {
  // Keep your existing email template - it's perfect!
  try {
    const welcomeText = isNewUser
      ? "Welcome to Dietify! We're excited to have you join our community."
      : "Welcome back to Dietify!";

    const { data, error } = await resend.emails.send({
      from: "Dietify <noreply@notify.dietify.in>",
      to: [email],
      subject: isNewUser
        ? "Welcome to Dietify - Your Login Code"
        : "Your Dietify Login Code",
      html: `
        <!-- Keep your existing beautiful email template -->
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${isNewUser ? "Welcome to Dietify" : "Your Dietify Login Code"}</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          <div style="background-color: #f8fafc; padding: 40px 20px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 32px; font-weight: 700; letter-spacing: 1px;">Dietify</h1>
                <p style="color: rgba(255, 255, 255, 0.9); margin: 8px 0 0 0; font-size: 16px;">Your AI Nutrition Companion</p>
              </div>
              <div style="padding: 40px 30px;">
                <h2 style="color: #1a202c; margin: 0 0 16px 0; font-size: 24px; font-weight: 600;">
                  ${isNewUser ? "Complete Your Registration" : "Login Verification Code"}
                </h2>
                <p style="color: #4a5568; margin: 0 0 24px 0; font-size: 16px; line-height: 1.5;">
                  ${welcomeText} Use the verification code below:
                </p>
                <div style="background-color: #f7fafc; border: 2px dashed #e2e8f0; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
                  <div style="font-size: 36px; font-weight: 700; color: #667eea; letter-spacing: 4px; font-family: 'Courier New', monospace;">
                    ${otp}
                  </div>
                  <p style="color: #718096; margin: 8px 0 0 0; font-size: 14px;">
                    This code will expire in 5 minutes
                  </p>
                </div>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error("Resend Error:", error);
      return false;
    }

    console.log(`📧 Email sent successfully to ${email}:`, data?.id);
    return true;
  } catch (error) {
    console.error("Email sending error:", error);
    return false;
  }
};



router.post("/send", async (req: Request, res: Response) => {
  try {
    console.log(req.body);
    const { identifier, type } = req.body as SendOTPRequest;

    if (!identifier || !type || type !== "email" || !isValidEmail(identifier)) {
      res.status(400).json({
        success: false,
        message: "Valid email address is required",
      } as OTPResponse);
      return;
    }

    // Check if user exists, if not create new user
    let user = await getUserByEmail(identifier);
    let isNewUser = false;

    if (!user) {
      user = await createNewUser(identifier);
      isNewUser = true;
    } else {
      await updateUser(user.id, { lastLoginAt: new Date() });
      isNewUser = user.isNewUser;
    }

    // Generate and store OTP
    const otp = generateOTP();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    otpStorage.set(identifier, { otp, expiresAt, attempts: 0 });

    // Send OTP email
    const emailSent = await sendOTPEmail(identifier, otp, isNewUser);

    if (!emailSent) {
      otpStorage.delete(identifier);
      res.status(500).json({
        success: false,
        message: "Failed to send email. Please try again.",
      } as OTPResponse);
      return;
    }

    console.log(
      `📧 OTP sent to ${identifier}: ${otp} (${isNewUser ? "NEW" : "EXISTING"} user)`
    );

    res.json({
      success: true,
      message: "OTP sent successfully to your email",
      data: {
        identifier,
        type: "email",
        isNewUser,
        expiresIn: 300,
        ...(process.env.NODE_ENV === "development" && { otp }),
      },
    } as OTPResponse);
  } catch (error) {
    console.error("Send OTP Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error. Please try again.",
    } as OTPResponse);
  }
});

// Verify OTP Route (Updated with JWT tokens)
router.post("/verify", async (req: Request, res: Response) => {
  try {
    const { identifier, otp, type } = req.body as VerifyOTPRequest;

     const isDemoUser = identifier === "demo@abc.com" && otp === "000000";
    
    if (isDemoUser) {
      console.log("🎯 Demo user login detected");
      
      // Get or create demo user
      let user = await getUserByEmail(identifier);
      if (!user) {
        user = await createNewUser(identifier);
        // Set demo user as not new for better UX
        user = await updateUser(user.id, { isNewUser: false });
      }

      // Generate JWT tokens for demo user
      const accessToken = generateAccessToken(user.id, user.email);
      const refreshToken = generateRefreshToken(user.id, user.email);

      // Hash and store refresh token in database
      const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

      // Update user with verification and refresh token
      user = await updateUser(user.id, {
        verified: true,
        lastLoginAt: new Date(),
        refreshToken: hashedRefreshToken,
      });

      const isNewUser = user.isNewUser;
      const needsOnboarding = !user.onboardingCompleted;

      console.log(`✅ Demo user verified: ${identifier}`);

      res.json({
        success: true,
        message: "Demo user verified successfully",
        data: {
          accessToken,
          refreshToken,
          user: {
            id: user.id,
            email: user.email,
            verified: true,
            isNewUser,
            needsOnboarding,
            onboardingCompleted: user.onboardingCompleted,
            createdAt: user.createdAt,
            lastLoginAt: user.lastLoginAt,
          },
        },
      } as OTPResponse);
      return;
    }

    // Validation
    if (!identifier || !otp || !type || type !== "email" || otp.length !== 6) {
      res.status(400).json({
        success: false,
        message: "Valid email and 6-digit OTP are required",
      } as OTPResponse);
      return;
    }

    // Get and verify stored OTP
    const storedOTPData = otpStorage.get(identifier);

    if (!storedOTPData) {
      res.status(400).json({
        success: false,
        message: "OTP not found. Please request a new OTP.",
      } as OTPResponse);
      return;
    }

    if (Date.now() > storedOTPData.expiresAt) {
      otpStorage.delete(identifier);
      res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new OTP.",
      } as OTPResponse);
      return;
    }

    if (storedOTPData.attempts >= 3) {
      otpStorage.delete(identifier);
      res.status(400).json({
        success: false,
        message:
          "Maximum verification attempts exceeded. Please request a new OTP.",
      } as OTPResponse);
      return;
    }

    if (storedOTPData.otp !== otp) {
      storedOTPData.attempts += 1;
      otpStorage.set(identifier, storedOTPData);
      res.status(400).json({
        success: false,
        message: `Invalid OTP. ${3 - storedOTPData.attempts} attempts remaining.`,
      } as OTPResponse);
      return;
    }

    // OTP is valid - remove from storage
    otpStorage.delete(identifier);

    // Get user and update verification status
    let user = await getUserByEmail(identifier);
    if (!user) {
      user = await createNewUser(identifier);
    }

    // Generate JWT tokens
    const accessToken = generateAccessToken(user.id, user.email);
    const refreshToken = generateRefreshToken(user.id, user.email);

    // Hash and store refresh token in database
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    // Update user with verification and refresh token
    user = await updateUser(user.id, {
      verified: true,
      lastLoginAt: new Date(),
      refreshToken: hashedRefreshToken,
    });

    const isNewUser = user.isNewUser;
    const needsOnboarding = !user.onboardingCompleted;

    console.log(
      `✅ User verified: ${identifier} (${isNewUser ? "NEW" : "EXISTING"} user)`
    );

    res.json({
      success: true,
      message: "OTP verified successfully",
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          verified: true,
          isNewUser,
          needsOnboarding,
          onboardingCompleted: user.onboardingCompleted,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
        },
      },
    } as OTPResponse);
  } catch (error) {
    console.error("Verify OTP Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error. Please try again.",
    } as OTPResponse);
  }
});

// Refresh Token Route (NEW)
router.post("/refresh-token", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(401).json({
        success: false,
        message: "Refresh token is required",
      });
      return;
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user || !user.refreshToken) {
      res.status(401).json({
        success: false,
        message: "Invalid refresh token",
      });
      return;
    }

    // Verify refresh token matches stored hash
    const isValidRefreshToken = await bcrypt.compare(
      refreshToken,
      user.refreshToken
    );

    if (!isValidRefreshToken) {
      res.status(401).json({
        success: false,
        message: "Invalid refresh token",
      });
      return;
    }

    // Generate new tokens
    const newAccessToken = generateAccessToken(user.id, user.email);
    const newRefreshToken = generateRefreshToken(user.id, user.email);

    // Hash and store new refresh token
    const hashedNewRefreshToken = await bcrypt.hash(newRefreshToken, 10);
    await updateUser(user.id, { refreshToken: hashedNewRefreshToken });

    res.json({
      success: true,
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (error) {
    console.error("Refresh Token Error:", error);
    res.status(401).json({
      success: false,
      message: "Invalid or expired refresh token",
    });
  }
});

// Logout Route (NEW)
router.post(
  "/logout",
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { userId } = (req as any).user;

      // Remove refresh token from database
      await updateUser(userId, { refreshToken: null });

      res.json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error) {
      console.error("Logout Error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

// Resend OTP Route (Keep existing, but use Prisma)
router.post("/resend-otp", async (req: Request, res: Response) => {
  try {
    const { identifier, type } = req.body as SendOTPRequest;

    if (!identifier || !type || type !== "email" || !isValidEmail(identifier)) {
      res.status(400).json({
        success: false,
        message: "Valid email address is required",
      } as OTPResponse);
      return;
    }

    let user = await getUserByEmail(identifier);
    let isNewUser = false;

    if (!user) {
      user = await createNewUser(identifier);
      isNewUser = true;
    } else {
      isNewUser = user.isNewUser;
    }

    // Delete existing OTP and generate new one
    otpStorage.delete(identifier);
    const otp = generateOTP();
    const expiresAt = Date.now() + 5 * 60 * 1000;

    otpStorage.set(identifier, { otp, expiresAt, attempts: 0 });

    const emailSent = await sendOTPEmail(identifier, otp, isNewUser);

    if (!emailSent) {
      otpStorage.delete(identifier);
      res.status(500).json({
        success: false,
        message: "Failed to resend email. Please try again.",
      } as OTPResponse);
      return;
    }

    console.log(`🔄 Resent OTP to ${identifier}: ${otp}`);

    res.json({
      success: true,
      message: "OTP resent successfully to your email",
      data: {
        identifier,
        type: "email",
        isNewUser,
        expiresIn: 300,
        ...(process.env.NODE_ENV === "development" && { otp }),
      },
    } as OTPResponse);
  } catch (error) {
    console.error("Resend OTP Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error. Please try again.",
    } as OTPResponse);
  }
});

// Clean up expired OTPs (keep existing)
setInterval(() => {
  const now = Date.now();
  for (const [identifier, data] of otpStorage.entries()) {
    if (now > data.expiresAt) {
      otpStorage.delete(identifier);
      console.log(`🧹 Cleaned up expired OTP for ${identifier}`);
    }
  }
}, 60000);

module.exports = router;
