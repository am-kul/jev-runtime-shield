const port = process.env.PORT ?? "3000";
try {
  const response = await fetch(`http://127.0.0.1:${port}/api/runtime`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "reset" }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Server returned ${response.status}`);
  console.log("Demo reset. SQLite history reseeded through the running application.");
} catch (error) {
  console.error(
    "Start npm run dev first, then run npm run reset. No database files were changed.",
    error instanceof Error ? error.message : "",
  );
  process.exitCode = 1;
}

export {};
