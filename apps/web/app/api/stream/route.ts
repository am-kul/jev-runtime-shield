import { runtimeEngine } from "@/packages/runtime/singleton";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const engine = await runtimeEngine();
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (state: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(state)}\n\n`));
      send(engine.snapshot());
      const unsubscribe = engine.subscribe(send);
      const heartbeat = setInterval(
        () => controller.enqueue(encoder.encode(": heartbeat\n\n")),
        15000,
      );
      cleanup = () => {
        unsubscribe();
        clearInterval(heartbeat);
      };
      request.signal.addEventListener(
        "abort",
        () => {
          cleanup();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        },
        { once: true },
      );
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
