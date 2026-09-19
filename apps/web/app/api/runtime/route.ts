import { z } from "zod";
import { runtimeEngine } from "@/packages/runtime/singleton";
import { localMutation } from "@/packages/runtime/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json((await runtimeEngine()).snapshot(), {
    headers: { "Cache-Control": "no-store" },
  });
}
export async function POST(request: Request) {
  const denied = localMutation(request);
  if (denied) return denied;
  try {
    const body = z
      .object({ action: z.enum(["start", "reset"]), scenario: z.string().optional() })
      .parse(await request.json());
    const engine = await runtimeEngine();
    return Response.json(
      body.action === "reset" ? await engine.reset() : await engine.start(body.scenario),
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 },
    );
  }
}
