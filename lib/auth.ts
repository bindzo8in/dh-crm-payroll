import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "./prisma";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin"
import { sendExistingUserSignupEmail, sendResetPasswordEmail, sendVerificationEmail } from "./email";
import { env } from "./env";
import { UserRole } from "@/app/generated/prisma/enums";
import { ac, adminRole, staffRole, superAdminRole } from './permissions'
import { expo } from "@better-auth/expo";

const canLog = process.env.NODE_ENV === "development"
export const auth = betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    logger: {
        disable: !canLog,
        disableColors: !canLog,
        level: "debug",
        log: (level, message, ...args) => {
            // Custom logging implementation
            console.log(`[${level}] ${message}`, ...args);
        }
    },
    trustedOrigins: [
        env.NEXT_PUBLIC_SITE_URL,
        "b8pulse://",

        // Development mode - Expo's exp:// scheme with local IP ranges
        ...(process.env.NODE_ENV === "development" ? [
            "exp://",                      // Trust all Expo URLs (prefix matching)
            "exp://**",                    // Trust all Expo URLs (wildcard matching)
            "exp://192.168.*.*:*/**",      // Trust 192.168.x.x IP range with any port and path
            "http://localhost:3000"
        ] : [])
    ],
    secret: env.BETTER_AUTH_SECRET,
    database: prismaAdapter(prisma, {
        provider: "postgresql"
    }),
    user: {
        additionalFields: {
            department: {
                type: "string",
                required: false,
            },
        },
    },
    session: {
        expiresIn: 60 * 60 * 24 * 30, // 30 days
        updateAge: 60 * 60 * 24, // 1 day,
        additionalFields: {
            department: {
                type: "string",
                required: false,
            },
        }
    },
    emailAndPassword: {
        enabled: true,
        autoSignIn: false,
        requireEmailVerification: true,
        resetPasswordTokenExpiresIn: 60 * 60, // 1 hour
        sendResetPassword: async ({ url, user }) => {
            sendResetPasswordEmail({
                email: user.email,
                appName: env.NEXT_PUBLIC_APP_NAME,
                resetUrl: url,
                supportEmail: env.NEXT_PUBLIC_SUPPORT_EMAIL,
            })
        },
        revokeSessionsOnPasswordReset: true,
        onExistingUserSignUp: async ({ user }) => {
            void sendExistingUserSignupEmail({
                email: user.email,
                appName: env.NEXT_PUBLIC_APP_NAME,
                name: user.name,
                supportEmail: env.NEXT_PUBLIC_SUPPORT_EMAIL,
            });
        },
    },
    emailVerification: {
        sendOnSignUp: true,
        sendOnSignIn: true,
        expiresIn: 24 * 60 * 60, // 24 hours
        sendVerificationEmail: async ({ token, url, user }) => {
            console.log("email is start sending for " + user.email + " with url: " + url);
            sendVerificationEmail({
                email: user.email,
                appName: env.NEXT_PUBLIC_APP_NAME,
                verificationUrl: url,
                supportEmail: env.NEXT_PUBLIC_SUPPORT_EMAIL,
                name: user.name,
            })
        },
        autoSignInAfterVerification: true,
    },
    socialProviders: {
        google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            accessType: "offline"
        }
    },
    plugins: [
        admin({
            ac,
            defaultRole: UserRole.STAFF,
            roles: {
                [UserRole.SUPER_ADMIN]: superAdminRole,
                [UserRole.ADMIN]: adminRole,
                [UserRole.STAFF]: staffRole,
            }

        }),
        expo(),
        nextCookies()// make sure this is the last plugin in the array
    ]
});