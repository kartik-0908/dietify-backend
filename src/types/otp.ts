// Types
export interface SendOTPRequest {
  identifier: string; // email only
  type: "email";
}

export interface VerifyOTPRequest {
  identifier: string;
  otp: string;
  type: "email";
}

export interface OTPResponse {
  success: boolean;
  message: string;
  data?: any;
}