"use client"
import * as z from "zod"
import { SigninSchema, signinSchema } from '@/lib/schemas/signin-schema'
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, Controller } from "react-hook-form"
import { motion } from "motion/react"
import { Check, Mail } from "lucide-react"
import { Field, FieldGroup, FieldContent, FieldLabel, FieldDescription, FieldError, FieldSeparator } from "@/components/ui/field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Password } from "@/components/password"
import { sendVerificationEmail, signIn } from "@/lib/auth-client"
import { useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import Link from "next/link"

const socialMediaButtons = [{ "src": "https://cdn.brandfetch.io/id6O2oGzv-/theme/dark/symbol.svg?c=1bxid64Mup7aczewSAYMX&t=1755835725776", "label": "Continue with Google", provider: "google" as const },
  // {"src":"https://cdn.brandfetch.io/idM8Hlme1a/theme/dark/symbol.svg?c=1bxid64Mup7aczewSAYMX&t=1668075051777","label":"Continue with Discord"}
]

export function SigninForm({ callbackUrl = '/' }: { callbackUrl: string }) {
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [isResendingVerification, setIsResendingVerification] =
    useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const form = useForm<SigninSchema>({
    resolver: zodResolver(signinSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
    }
  })
  const { formState: { isSubmitting } } = form;

  const handleSubmit = form.handleSubmit(async (data: SigninSchema) => {
    try {
      const { data:res, error } = await signIn.email({
        email: data.email,
        password: data.password,
        rememberMe: data.rememberMe,
        callbackURL: callbackUrl
      })
      console.log(res)
      if (error) throw error
      form.reset();
    } catch (error: any) {
      if (error?.status === 403) {
        setUnverifiedEmail(data.email);
        setNeedsVerification(true);
        return;
      }

      setError(error.message ?? "Failed to sign in.");
    }
  });

  const continueWith = async ({ provider }: { provider: "google" }) => {
    try {
      await signIn.social({
        provider,
        callbackURL: callbackUrl,
      })
    } catch (error) {
      setMessage(`an error occured while signing in with ${provider}, try again!`)
    }
  }

  const handleResendVerification = async () => {
    if (!unverifiedEmail) return;

    try {
      setIsResendingVerification(true);
      setVerificationMessage(null);

      const { error } = await sendVerificationEmail({
        email: unverifiedEmail,
        callbackURL: callbackUrl,
      });

      if (error) {
        setVerificationMessage(
          error.message ?? "Failed to resend verification email."
        );
        return;
      }

      setVerificationMessage(
        "Verification email sent successfully. Please check your inbox."
      );
    } finally {
      setIsResendingVerification(false);
    }
  };

  if (needsVerification && unverifiedEmail) {
    return (
      <div className="p-2 sm:p-5 md:p-8 w-full rounded-md border max-w-3xl mx-auto">
        <div className="flex flex-col items-center text-center py-8">
          <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Mail className="size-8 text-primary" />
          </div>

          <h2 className="text-3xl font-bold tracking-tight">
            Verify your email
          </h2>

          <p className="text-muted-foreground mt-3 max-w-md">
            We've sent a verification link to:
          </p>

          <p className="font-medium mt-1">
            {unverifiedEmail}
          </p>

          <p className="text-muted-foreground mt-4 max-w-md">
            Please verify your email address before signing in.
            Once verified, return here and continue.
          </p>

          {verificationMessage && (
            <Alert className="mt-6 text-left max-w-md">
              <AlertTitle>
                Verification Email
              </AlertTitle>
              <AlertDescription>
                {verificationMessage}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col sm:flex-row gap-3 mt-8 w-full max-w-md">
            <Button
              className="flex-1"
              onClick={handleResendVerification}
              disabled={isResendingVerification}
            >
              {isResendingVerification
                ? "Sending..."
                : "Resend Verification Email"}
            </Button>

            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setNeedsVerification(false);
                setUnverifiedEmail(null);
                setVerificationMessage(null);
              }}
            >
              Back to Login
            </Button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <form onSubmit={handleSubmit} className="p-2 sm:p-5 md:p-8 w-full rounded-md gap-2 border max-w-3xl mx-auto">
        <FieldGroup className="grid md:grid-cols-6 gap-4 mb-6">
          <h1 className="mt-6 mb-1 font-extrabold text-3xl tracking-tight col-span-full">Login</h1>
          <p className="tracking-wide text-muted-foreground mb-5 text-wrap text-sm col-span-full">Login to create an account</p>

          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} className="gap-1 col-span-full">
                <FieldLabel htmlFor="email">Email </FieldLabel>
                <Input
                  {...field}
                  id="email"
                  type="text"
                  onChange={(e) => {
                    field.onChange(e.target.value)
                  }}
                  aria-invalid={fieldState.invalid}
                  placeholder="Enter your Email"

                />

                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />

          <Controller
            name="password"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} className="gap-1 col-span-full">
                <FieldLabel htmlFor="password">Password *</FieldLabel>
                <Password
                  {...field}
                  aria-invalid={fieldState.invalid}
                  id="password"
                  placeholder="Password"

                />
                <FieldContent className="flex justify-center items-end w-full">
                  <Link href="/forget-password" className="text-sm text-primary text-nowrap hover:underline">
                    Forgot password?
                  </Link>
                </FieldContent>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )} />
          <Controller
            name="rememberMe"
            control={form.control}
            render={({ field }) => (
              <Field className="gap-1 col-span-full">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="rememberMe"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <FieldLabel htmlFor="rememberMe">
                    Remember me
                  </FieldLabel>
                </div>
              </Field>
            )}
          />
          <FieldSeparator className="my-4 col-span-full">OR</FieldSeparator>
          <div className="flex gap-3 justify-center w-full items-center flex-wrap pb-3 col-span-full">
            {socialMediaButtons.map((o) => (
              <Button key={o.label} variant="outline" type="button"
                className="text-sm gap-2 px-2 h-10 grow "
                onClick={() => {
                  continueWith({ provider: o.provider });
                }}
              >
                <div className="place-items-center grid rounded-full bg-white size-6 p-0.5">
                  <img src={o.src} width={16} height={16} />
                </div>
                {o.label}
              </Button>
            ))}
          </div>
        </FieldGroup>
        <div className="flex justify-end items-center w-full">
          <Button disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </Button>
        </div>
        <div className="mt-4 text-center text-sm">
          Don't have an account?{" "}
          <Link href="/signup" className="text-primary hover:underline">
            Sign up
          </Link>
        </div>
      </form>
    </>
  )
}