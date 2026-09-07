import { createEnv } from "@t3-oss/env-nextjs";
import * as z from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(1),
    BETTER_AUTH_URL: z.url(),
    RESEND_API_KEY: z.string().min(1),
    MAIL_FROM: z.string().min(1),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    CHROMIUM_REMOTE_EXEC_PATH: z.string().nonempty(),
    EXCHANGE_RATE_API_KEY: z.string().optional(),
    MOBILE_APP_SCHEME: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_NAME: z.string().default("CRM"),
    NEXT_PUBLIC_SITE_URL: z.url(),
    NEXT_PUBLIC_SUPPORT_EMAIL: z.email(),
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().min(1),
    NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET: z.string().min(1),
    NEXT_PUBLIC_EMP_PREFIX: z.string().default("EMP-"),
  },
  // For Next.js >= 13.4.4, you only need to destructure client variables:
  experimental__runtimeEnv: {
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET: process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_EMP_PREFIX: process.env.NEXT_PUBLIC_EMP_PREFIX,
  },
});