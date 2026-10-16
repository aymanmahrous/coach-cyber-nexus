import { z } from "zod";
import { callOfficialRpc } from "@/lib/official-backend";
import type { OfficialStaffSession } from "@/lib/official-auth";

const ContentStatus = z.enum([
  "idea",
  "draft",
  "generated",
  "needs_review",
  "approved",
  "scheduled",
  "published",
  "failed",
  "cancelled",
]);
const MutationResult = z
  .object({
    success: z.boolean(),
    code: z.string().optional(),
    contentItemId: z.string().uuid().optional(),
    status: ContentStatus.optional(),
    scheduledFor: z.string().nullable().optional(),
    updatedAt: z.string().optional(),
    publishJobId: z.string().uuid().optional(),
  })
  .passthrough();

export type EditableContentFields = {
  topic: string;
  hook: string;
  caption: string;
  cta: string;
  hashtags: string[];
  visualPrompt: string;
};
export type ContentTransitionAction = "approve" | "return_to_review" | "schedule" | "unschedule";
export type ContentRpcName =
  | "update_staff_content_item"
  | "transition_staff_content_item"
  | "approve_and_schedule_staff_content_item";
export type RpcInvoker = (
  session: Pick<OfficialStaffSession, "accessToken">,
  name: string,
  body: Record<string, unknown>,
) => Promise<unknown>;

export class ContentRpcError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ContentRpcError";
  }
}

const UpdateBody = z.object({
  p_content_item_id: z.string().uuid(),
  p_topic: z.string().trim().max(300),
  p_hook: z.string().trim().max(500),
  p_caption: z.string().trim().max(10_000),
  p_cta: z.string().trim().max(500),
  p_hashtags: z.array(z.string().trim().max(100)).max(30),
  p_visual_prompt: z.string().trim().max(5_000),
});
const TransitionBody = z.object({
  p_content_item_id: z.string().uuid(),
  p_action: z.enum(["approve", "return_to_review", "schedule", "unschedule"]),
  p_scheduled_for: z.string().datetime({ offset: true }).nullable(),
});
const ScheduleBody = z.object({
  p_content_item_id: z.string().uuid(),
  p_scheduled_for: z.string().datetime({ offset: true }),
});

async function invokeChecked(
  rpc: RpcInvoker,
  session: Pick<OfficialStaffSession, "accessToken">,
  name: ContentRpcName,
  body: Record<string, unknown>,
) {
  const result = MutationResult.parse(await rpc(session, name, body));
  if (!result.success) throw new ContentRpcError(result.code ?? "CONTENT_MUTATION_REJECTED");
  return result;
}

export async function updateStaffContentItem(
  session: Pick<OfficialStaffSession, "accessToken">,
  contentItemId: string,
  fields: EditableContentFields,
  rpc: RpcInvoker = callOfficialRpc,
) {
  const body = UpdateBody.parse({
    p_content_item_id: contentItemId,
    p_topic: fields.topic,
    p_hook: fields.hook,
    p_caption: fields.caption,
    p_cta: fields.cta,
    p_hashtags: fields.hashtags,
    p_visual_prompt: fields.visualPrompt,
  });
  return invokeChecked(rpc, session, "update_staff_content_item", body);
}

export async function transitionStaffContentItem(
  session: Pick<OfficialStaffSession, "accessToken">,
  contentItemId: string,
  action: ContentTransitionAction,
  scheduledFor: string | null = null,
  rpc: RpcInvoker = callOfficialRpc,
) {
  const body = TransitionBody.parse({
    p_content_item_id: contentItemId,
    p_action: action,
    p_scheduled_for: scheduledFor,
  });
  return invokeChecked(rpc, session, "transition_staff_content_item", body);
}

/**
 * This RPC is atomic in the reviewed SQL migration. It also queues publication;
 * callers must use it only after an explicit review confirmation and never in tests
 * that point at a live backend.
 */
export async function approveAndScheduleStaffContentItem(
  session: Pick<OfficialStaffSession, "accessToken">,
  contentItemId: string,
  scheduledFor: string,
  rpc: RpcInvoker = callOfficialRpc,
) {
  const body = ScheduleBody.parse({
    p_content_item_id: contentItemId,
    p_scheduled_for: scheduledFor,
  });
  return invokeChecked(rpc, session, "approve_and_schedule_staff_content_item", body);
}
