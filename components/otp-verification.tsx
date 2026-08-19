"use client"
import * as z from "zod"
import { otpSchema } from '@/lib/schemas/otp-schema'
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, Controller } from "react-hook-form"
import { motion } from "motion/react"
import { Check } from "lucide-react"
import { Field, FieldGroup, FieldContent, FieldLabel, FieldDescription, FieldError, FieldSeparator } from "@/components/ui/field"
import { Button } from "@/components/ui/button"
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot
} from "@/components/ui/input-otp"



type Schema = z.infer<typeof otpSchema>;

export function DraftForm() {

const form = useForm<Schema>({
  resolver: zodResolver(otpSchema),
})
const { formState: { isSubmitting, isSubmitSuccessful } } = form;

const handleSubmit = form.handleSubmit(async (data: Schema) => {
  try {
    // TODO: implement form submission
    form.reset();
  } catch (error) {
    // TODO: handle error
  }
});

  if (isSubmitSuccessful) {
    return (<div className="p-2 sm:p-5 md:p-8 w-full rounded-md gap-2 border">
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, stiffness: 300, damping: 25 }}
          className="h-full py-6 px-3"
        >
          <motion.div
            initial={{ scale: 0.5 }}
            animate={{ scale: 1 }}
            transition={{
              delay: 0.3,
              type: "spring",
              stiffness: 500,
              damping: 15,
            }}
            className="mb-4 flex justify-center border rounded-full w-fit mx-auto p-2"
          >
            <Check className="size-8" />
          </motion.div>
          <h2 className="text-center text-2xl text-pretty font-bold mb-2">
            Thank you
          </h2>
          <p className="text-center text-lg text-pretty text-muted-foreground">
            Form submitted successfully, we will get back to you soon
          </p>
        </motion.div>
      </div>)
  }
return (
      <form onSubmit={handleSubmit} className="p-2 sm:p-5 md:p-8 w-full rounded-md gap-2 border max-w-3xl mx-auto">
        <FieldGroup className="grid md:grid-cols-6 gap-4 mb-6">
          <h1 className="mt-6 mb-1 font-extrabold text-3xl tracking-tight col-span-full">📧 Email Verification</h1>
<p className="tracking-wide text-muted-foreground mb-5 text-wrap text-sm col-span-full">We've sent a verification code to</p>
<h3 className="mt-3 mb-1 font-semibold text-xl tracking-tight col-span-full">Verify your email</h3>

        <Controller
            name="otp-d8c" 
            control={form.control}
            render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="gap-1 col-span-full">
                  <FieldContent className="gap-1">
                    <FieldLabel htmlFor="otp-d8c">One-Time Password </FieldLabel>
                    <FieldDescription>Enter the 6-digit code sent to your email address.</FieldDescription>
                  </FieldContent>
                    <InputOTP
                      {...field}
                      aria-invalid={fieldState.invalid}
                      id="otp-d8c"
                      
                      maxLength={6}
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                      </InputOTPGroup>
                      <InputOTPSeparator />
                      <InputOTPGroup>
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
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
)}