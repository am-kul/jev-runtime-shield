export function localMutation(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("host")?.split(":")[0];
  const origin = request.headers.get("origin");
  if (
    !["localhost", "127.0.0.1"].includes(host ?? "") ||
    (origin && origin !== url.origin && origin !== `http://${request.headers.get("host")}`)
  )
    return Response.json({ error: "Local same-origin requests only" }, { status: 403 });
  return null;
}
