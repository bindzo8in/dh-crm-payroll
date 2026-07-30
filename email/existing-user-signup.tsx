import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface ExistingUserSignupEmailProps {
  name: string;
  appName: string;
  supportEmail: string;
}

export default function ExistingUserSignupEmail({
  name,
  appName,
  supportEmail,
}: ExistingUserSignupEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Someone tried to create an account using your email address.
      </Preview>

      <Body
        style={{
          margin: 0,
          padding: "40px 20px",
          backgroundColor: "#f6f9fc",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <Container
          style={{
            maxWidth: "600px",
            margin: "0 auto",
            backgroundColor: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <Section
            style={{
              backgroundColor: "#2563eb",
              padding: "32px",
              textAlign: "center",
            }}
          >
            <Heading
              style={{
                margin: 0,
                color: "#ffffff",
                fontSize: "28px",
                fontWeight: "700",
              }}
            >
              Account Already Exists
            </Heading>
          </Section>

          {/* Content */}
          <Section style={{ padding: "40px" }}>
            <Text
              style={{
                fontSize: "16px",
                color: "#111827",
                marginTop: 0,
              }}
            >
              Hi <strong>{name || "there"}</strong>,
            </Text>

            <Text
              style={{
                fontSize: "15px",
                lineHeight: "24px",
                color: "#374151",
              }}
            >
              Someone recently tried to create an account using this email
              address for <strong>{appName}</strong>.
            </Text>

            <Text
              style={{
                fontSize: "15px",
                lineHeight: "24px",
                color: "#374151",
              }}
            >
              If this was you, your account already exists. Please sign in
              using your existing account instead of creating a new one.
            </Text>

            {/* Information Box */}
            <Section
              style={{
                margin: "32px 0",
                padding: "20px",
                backgroundColor: "#eff6ff",
                border: "1px solid #bfdbfe",
                borderRadius: "8px",
              }}
            >
              <Text
                style={{
                  margin: 0,
                  fontSize: "15px",
                  fontWeight: "600",
                  color: "#1e3a8a",
                }}
              >
                If this was you
              </Text>

              <Text
                style={{
                  marginBottom: 0,
                  fontSize: "14px",
                  lineHeight: "22px",
                  color: "#1e40af",
                }}
              >
                Open the <strong>{appName}</strong> app or visit our website and
                sign in using your existing account.
              </Text>
            </Section>

            {/* Security Notice */}
            <Section
              style={{
                margin: "32px 0",
                padding: "20px",
                backgroundColor: "#f9fafb",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
              }}
            >
              <Text
                style={{
                  margin: 0,
                  fontSize: "15px",
                  fontWeight: "600",
                  color: "#111827",
                }}
              >
                Didn't make this request?
              </Text>

              <Text
                style={{
                  marginBottom: 0,
                  fontSize: "14px",
                  lineHeight: "22px",
                  color: "#4b5563",
                }}
              >
                No action is required. You can safely ignore this email. No
                changes have been made to your account, and nobody can access
                it without your password.
              </Text>
            </Section>

            <Text
              style={{
                fontSize: "14px",
                lineHeight: "22px",
                color: "#4b5563",
              }}
            >
              If you continue receiving these emails unexpectedly or need help
              accessing your account, please contact our support team at{" "}
              <a
                href={`mailto:${supportEmail}`}
                style={{
                  color: "#2563eb",
                  textDecoration: "none",
                }}
              >
                {supportEmail}
              </a>.
            </Text>
          </Section>

          {/* Footer */}
          <Section
            style={{
              padding: "24px 40px",
              borderTop: "1px solid #e5e7eb",
              backgroundColor: "#fafafa",
            }}
          >
            <Text
              style={{
                margin: 0,
                fontSize: "12px",
                lineHeight: "18px",
                color: "#6b7280",
                textAlign: "center",
              }}
            >
              This is an automated security notification from{" "}
              <strong>{appName}</strong>.
            </Text>

            <Text
              style={{
                margin: "8px 0 0",
                fontSize: "12px",
                color: "#9ca3af",
                textAlign: "center",
              }}
            >
              © {new Date().getFullYear()} {appName}. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}