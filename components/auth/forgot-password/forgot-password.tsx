"use client"
import { forgotPasswordSchema, ForgotPasswordSchema } from '@/lib/schemas/forgot-password-schema'
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, Controller } from "react-hook-form"
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { requestPasswordReset } from "@/lib/auth-client"
import { useEffect, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { Mail } from 'lucide-react'
import Link from 'next/link'

export function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] =
    useState<string | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);

  const form = useForm<ForgotPasswordSchema>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: ""
    }
  })

  const { formState: { isSubmitting } } = form;

  const handleSubmit = form.handleSubmit(async (data: ForgotPasswordSchema) => {
    setError(null);

    const { error, data: res } = await requestPasswordReset({
      email: data.email,
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      if (error.status === 429) {
        setError("Too many requests. Please try again later.");
        return;
      }
      setError(error.message ?? "An error occurred");
      return;
    }

    // Success - typically returns a generic message to prevent email enumeration
    setSubmittedEmail(data.email);
    setResendAvailableAt(Date.now() + 60_000);
    form.reset();
  });

  useEffect(() => {
    if (!resendAvailableAt) return;

    const timer = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil((resendAvailableAt - Date.now()) / 1000)
      );

      setCooldown(remaining);

      if (remaining <= 0) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [resendAvailableAt]);

  const handleResend = async () => {
    if (!submittedEmail || cooldown > 0) return;

    try {
      setError(null);
      setIsResending(true);

      const { error } = await requestPasswordReset({
        email: submittedEmail,
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        if (error.status === 429) {
          setError("Too many requests. Please try again later.");
          return;
        }

        setError(error.message ?? "Failed to resend email");
        return;
      }

      setResendAvailableAt(Date.now() + 60_000);
    } finally {
      setIsResending(false);
    }
  };

  if (submittedEmail) {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="flex flex-col items-center py-10 text-center">
          <Mail className="size-12 mb-4" />

          <h2 className="text-2xl font-bold">
            Check your email
          </h2>

          <p className="text-muted-foreground mt-3">
            If an account exists for
          </p>

          <p className="font-medium">
            {submittedEmail}
          </p>

          <p className="text-muted-foreground mt-4">
            We've sent a password reset link.
          </p>

          <p className="text-sm text-muted-foreground mt-2">
            Didn't receive the email? Check your spam folder or resend the email after the cooldown period.
          </p>

          <div className="flex flex-col sm:flex-row gap-2 mt-6 w-full">
            <Button asChild className="flex-1" variant="outline">
              <Link href="/">
                Back Home
              </Link>
            </Button>
            <Button
              className="flex-1"
              variant="outline"
              disabled={cooldown > 0 || isResending}
              onClick={handleResend}
            >
              {isResending
                ? "Sending..."
                : cooldown > 0
                  ? `Resend in ${cooldown}s`
                  : "Resend Email"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {
        error &&
        <Alert variant={'destructive'}>
          <AlertTitle>Reset Password</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      }
      <form onSubmit={handleSubmit} className="p-2 sm:p-5 md:p-8 w-full rounded-md gap-2 border max-w-3xl mx-auto">
        <FieldGroup className="grid md:grid-cols-6 gap-4 mb-6">
          <h1 className="mt-6 mb-1 font-extrabold text-3xl tracking-tight col-span-full">🔐 Forgot Paaword</h1>
          <p className="tracking-wide text-muted-foreground mb-5 text-wrap text-sm col-span-full">Enter the email address associated with your account and we'll send you a password reset link.</p>

          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} className="gap-1 col-span-full">
                <FieldLabel htmlFor="email">Email Address *</FieldLabel>
                <Input
                  {...field}
                  id="email"
                  type="text"
                  onChange={(e) => {
                    field.onChange(e.target.value)
                  }}
                  aria-invalid={fieldState.invalid}
                  placeholder="Ex. john@doe.com"

                />

                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </FieldGroup>
        <div className="flex justify-end items-center w-full">
          <Button disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </Button>
        </div>
      </form>
    </>
  )
}