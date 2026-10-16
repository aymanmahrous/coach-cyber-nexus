import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseInboundMessages, verifyWebhookSignature } from "./whatsapp";

const sig = (body: string, secret: string) =>
  `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;

describe("verifyWebhookSignature", () => {
  const body = JSON.stringify({ object: "whatsapp_business_account" });
  it("accepts a valid signature", () => {
    expect(verifyWebhookSignature(body, sig(body, "s3cret"), "s3cret")).toBe(true);
  });
  it("rejects a wrong secret, a modified body, or a missing header", () => {
    expect(verifyWebhookSignature(body, sig(body, "other"), "s3cret")).toBe(false);
    expect(verifyWebhookSignature(body + " ", sig(body, "s3cret"), "s3cret")).toBe(false);
    expect(verifyWebhookSignature(body, null, "s3cret")).toBe(false);
  });
  it("rejects everything when no app secret is configured", () => {
    expect(verifyWebhookSignature(body, sig(body, ""), "")).toBe(false);
  });
});

describe("parseInboundMessages", () => {
  it("extracts text messages with the contact name", () => {
    const msgs = parseInboundMessages({
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ wa_id: "971500000000", profile: { name: "Sara" } }],
                messages: [
                  {
                    id: "wamid.1",
                    from: "971500000000",
                    timestamp: "1760000000",
                    type: "text",
                    text: { body: "Hi coach" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(msgs).toEqual([
      {
        id: "wamid.1",
        direction: "in",
        contact: "971500000000",
        name: "Sara",
        type: "text",
        text: "Hi coach",
        timestamp: new Date(1760000000 * 1000).toISOString(),
      },
    ]);
  });
  it("ignores status-only events and malformed payloads", () => {
    expect(parseInboundMessages({ entry: [{ changes: [{ value: { statuses: [{}] } }] }] })).toEqual(
      [],
    );
    expect(parseInboundMessages(null)).toEqual([]);
  });
});
