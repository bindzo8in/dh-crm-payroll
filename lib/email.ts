import { Resend } from 'resend'
import { env } from './env'
import VerificationEmail from '@/email/verification-email'
import ResetPasswordEmail from '@/email/reset-password';
import ExistingUserSignupEmail from "@/email/existing-user-signup";

const resend = new Resend(env.RESEND_API_KEY)

export async function sendVerificationEmail({ email, appName, verificationUrl, supportEmail, name }: { email: string, appName: string, verificationUrl: string, supportEmail: string, name: string }): Promise<void> {
    try {
        const { data, error } = await resend.emails.send({
            from: env.MAIL_FROM,
            to: email,
            subject: `Verify your email address for ${appName}`,
            react: VerificationEmail({
                name,
                appName,
                verificationUrl,
                supportEmail,
            }),
            tags: [
                { name: "type", value: "email-verification" }
            ]
        });
        if (error) {
            throw error;
        }

    } catch (error) {
        console.error(error);
    }
}

export async function sendResetPasswordEmail({ appName, email, resetUrl, supportEmail }: { email: string, appName: string, resetUrl: string, supportEmail: string }) {
    try {
        const { error } = await resend.emails.send({
            from: env.MAIL_FROM,
            to: email,
            subject: `Reset Password - ${appName}`,
            react: ResetPasswordEmail({
                appName,
                resetUrl,
                supportEmail,
            }),
            tags: [
                { name: "type", value: "reset-password" }
            ]
        });
        if (error) throw error
    }
    catch (error) {
        console.error(error)
    }
}

export async function sendProposalLinkEmail({ email, appName, proposalUrl, companyName }: { email: string, appName: string, proposalUrl: string, companyName: string }) {
    try {
        const { error } = await resend.emails.send({
            from: env.MAIL_FROM,
            to: email,
            subject: `Proposal from ${companyName}`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>Hello,</h2>
                    <p>You have received a new proposal from <strong>${companyName}</strong>.</p>
                    <p>You can review and accept the proposal by clicking the link below:</p>
                    <p style="margin: 30px 0;">
                        <a href="${proposalUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">View Proposal</a>
                    </p>
                    <p>Or copy and paste this URL into your browser:</p>
                    <p><a href="${proposalUrl}">${proposalUrl}</a></p>
                    <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;" />
                    <p style="color: #666; font-size: 14px;">Powered by ${appName}</p>
                </div>
            `,
            tags: [
                { name: "type", value: "proposal-link" }
            ]
        });
        if (error) throw error;
    } catch (error) {
        console.error("Failed to send proposal email:", error);
        throw error;
    }
}

export async function sendInvoiceLinkEmail({ email, appName, invoiceUrl, invoiceNumber, companyName }: { email: string, appName: string, invoiceUrl: string, invoiceNumber: string, companyName: string }) {
    try {
        const { error } = await resend.emails.send({
            from: env.MAIL_FROM,
            to: email,
            subject: `Invoice INV-${invoiceNumber} from ${companyName}`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>Hello,</h2>
                    <p>You have received a new invoice (<strong>INV-${invoiceNumber}</strong>) from <strong>${companyName}</strong>.</p>
                    <p>You can review and pay/download your invoice by clicking the link below:</p>
                    <p style="margin: 30px 0;">
                        <a href="${invoiceUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">View Invoice</a>
                    </p>
                    <p>Or copy and paste this URL into your browser:</p>
                    <p><a href="${invoiceUrl}">${invoiceUrl}</a></p>
                    <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;" />
                    <p style="color: #666; font-size: 14px;">Powered by ${appName}</p>
                </div>
            `,
            tags: [
                { name: "type", value: "invoice-link" }
            ]
        });
        if (error) throw error;
    } catch (error) {
        console.error("Failed to send invoice email:", error);
        throw error;
    }
}

export async function sendExistingUserSignupEmail({
    email,
    appName,
    supportEmail,
    name,
}: {
    email: string;
    appName: string;
    supportEmail: string;
    name: string;
}) {
    try {
        const { error } = await resend.emails.send({
            from: env.MAIL_FROM,
            to: email,
            subject: `Your ${appName} account already exists`,
            react: ExistingUserSignupEmail({
                name,
                appName,
                supportEmail,
            }),
            tags: [
                {
                    name: "type",
                    value: "existing-user-signup",
                },
            ],
        });

        if (error) throw error;
    } catch (error) {
        console.error("Failed to send existing user signup email:", error);
        throw error;
    }
}