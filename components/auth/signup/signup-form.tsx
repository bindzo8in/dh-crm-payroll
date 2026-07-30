"use client"
import { signupSchema, SignupSchemaType } from '@/lib/schemas/signup-schema'
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, Controller } from "react-hook-form"
import { AlertCircle } from "lucide-react"
import { Field, FieldGroup, FieldContent, FieldLabel, FieldError, FieldSeparator } from "@/components/ui/field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Password } from "@/components/password"
import { Checkbox } from "@/components/ui/checkbox"
import { signUp, signIn, sendVerificationEmail } from '@/lib/auth-client'
import { useState } from 'react'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import Link from "next/link"

const socialMediaButtons = [{ "src": "https://cdn.brandfetch.io/id6O2oGzv-/theme/dark/symbol.svg?c=1bxid64Mup7aczewSAYMX&t=1755835725776", "label": "Continue with Google", provider: "google" as const },
  // {"src":"https://cdn.brandfetch.io/idZAyF9rlg/theme/dark/symbol.svg?c=1bxid64Mup7aczewSAYMX&t=1719469980739","label":"Continue with GitHub"}
]

export function SignupForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<SignupSchemaType>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: "",
      name: "",
      password: "",
      "confirm-password": "",
    }
  })

  const handleSubmit = form.handleSubmit(async (data) => {
    try {
      setIsLoading(true);
      setError(null);
      setMessage(null);

      const { data: signUpData, error } = await signUp.email({
        email: data.email,
        password: data.password,
        name: data.name,
        callbackURL: window.location.origin
      });
      if (signUpData?.user?.emailVerified === false) {
        const createdAtTime = new Date(signUpData?.user.createdAt).getTime();
        const currentTime = Date.now();

        const isExistingUser = (currentTime - createdAtTime) > 10000;
        console.log(currentTime - createdAtTime)
        if (isExistingUser) {
          console.log("Existing unverified account detected. Manually triggering email...");
          const { error: verifyError } = await sendVerificationEmail({ email: data.email })
          if (verifyError) {
            console.error("Failed to trigger verification email:", verifyError.message);
          } else {
            console.log("Verification email sent successfully to existing user!");
          }
        }

      } else {
        console.log("New user registered. The backend automatically sent the email.");
      }


      setMessage(
        `If this email is not already registered, an account has been created. Please check your inbox for verification.`
      );

      form.reset();
    } catch (error) {

      setError("Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  });

  const continueWith = async ({ provider }: { provider: "google" }) => {
    try {
      await signIn.social({
        provider,
        callbackURL: "/"
      })
    } catch (error) {
      setMessage(`an error occured while signing in with ${provider}, try again!`)
    }
  }

  return (
    <>
      {message && (
        <Alert variant="default">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>
            {message}
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error}
          </AlertDescription>
        </Alert>
      )}
      <form onSubmit={handleSubmit} className="p-2 sm:p-5 md:p-8 w-full rounded-md gap-2 border max-w-3xl mx-auto">
        <FieldGroup className="grid md:grid-cols-6 gap-4 mb-6">
          <h1 className="mt-6 mb-1 font-extrabold text-3xl tracking-tight col-span-full">Sign Up</h1>
          <p className="tracking-wide text-muted-foreground mb-5 text-wrap text-sm col-span-full">You need an account to get started</p>

          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} className="gap-1 col-span-full">
                <FieldLabel htmlFor="name">Your Name *</FieldLabel>
                <Input
                  {...field}
                  id="name"
                  type="text"
                  onChange={(e) => {
                    field.onChange(e.target.value)
                  }}
                  aria-invalid={fieldState.invalid}
                  placeholder="Enter your Name"

                />

                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />

          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} className="gap-1 col-span-full">
                <FieldLabel htmlFor="email">Email *</FieldLabel>
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
              <Field data-invalid={fieldState.invalid} className="gap-1 col-span-full md:col-span-3">
                <FieldContent className="gap-0.5">
                  <FieldLabel htmlFor="password">Password *</FieldLabel>

                </FieldContent>
                <Password
                  {...field}
                  aria-invalid={fieldState.invalid}
                  id="password"
                  placeholder="Password"

                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )} />

          <Controller
            name="confirm-password"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} className="gap-1 col-span-full md:col-span-3">
                <FieldContent className="gap-0.5">
                  <FieldLabel htmlFor="confirm-password">Confirm Password *</FieldLabel>

                </FieldContent>
                <Password
                  {...field}
                  aria-invalid={fieldState.invalid}
                  id="confirm-password"
                  placeholder="Confirm Password"

                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )} />
          <FieldSeparator className="my-4 col-span-full">OR</FieldSeparator>
          <div className="flex gap-3 justify-center w-full items-center flex-wrap pb-3 col-span-full">
            {socialMediaButtons.map((o) => (
              <Button key={o.label} variant="outline" type="button"
                className="text-sm gap-2 px-2 h-10 grow "
                onClick={() => { continueWith({ provider: o.provider }) }}
              >
                <div className="place-items-center grid rounded-full bg-white size-6 p-0.5">
                  <img src={o.src} width={16} height={16} />
                </div>
                {o.label}
              </Button>
            ))}
          </div>
          <Controller
            name="agree"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} className="gap-1 col-span-full">
                <div className="flex items-center gap-2 mb-1">
                  <Checkbox
                    id="agree"
                    checked={field.value ?? false}
                    onCheckedChange={field.onChange}
                    aria-invalid={fieldState.invalid}

                  />
                  <FieldLabel htmlFor="agree">I agree to the terms and conditions *</FieldLabel>

                </div>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </FieldGroup>
        <div className="flex justify-end items-center w-full">
          <Button disabled={isLoading}>
            {isLoading ? 'Submitting...' : 'Submit'}
          </Button>
        </div>
        <div className="mt-4 text-center text-sm">
          Already have an account?{" "}
          <Link href="/signin" className="text-primary hover:underline">
            Sign in
          </Link>
        </div>
      </form>
    </>
  )
}