import { z } from "zod";
import { runtimeEngine } from "@/packages/runtime/singleton";
import { localMutation } from "@/packages/runtime/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const denied = localMutation(request);
  if (denied) return denied;
  try {
    const body = z
      .object({
        records: z.number().int().positive().max(100000).default(48219),
        verify: z.boolean().default(false),
      })
      .parse(await request.json());
    const result = await (await runtimeEngine()).requestExport(body.records, body.verify);
    return Response.json(result, { status: result.status });
  } catch {
    return Response.json({ error: "Invalid export request" }, { status: 400 });
  }
}
