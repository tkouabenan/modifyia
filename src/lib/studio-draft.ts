import { z } from "zod";
export const studioDraftSchema = z.object({
  id: z.string().uuid().nullable().default(null),
  name: z.string().min(1).max(100).default("Untitled transformation"),
  prompt: z.string().max(10000).default(""),
  source_id: z.string().uuid().nullable().default(null),
  character_ids: z.array(z.string().uuid()).max(8).default([]),
  trim_start: z.number().min(0).max(300).default(0),
  trim_end: z.number().min(0).max(300).default(0),
  aspect: z
    .enum(["original", "16:9", "9:16", "1:1", "4:5"])
    .default("original"),
  audio: z.enum(["preserve", "mute"]).default("preserve"),
});
export type StudioDraft = z.infer<typeof studioDraftSchema>;
export function parseStudioDraft(raw: string | null): StudioDraft {
  try {
    const parsed = studioDraftSchema.safeParse(raw ? JSON.parse(raw) : {});
    if (parsed.success) return parsed.data;
  } catch {
    /* Discard invalid or obsolete browser data. */
  }
  return studioDraftSchema.parse({});
}
