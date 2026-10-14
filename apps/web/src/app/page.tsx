import { HealthResponseSchema } from "@payscope/shared";

export default function Home() {
  const health = HealthResponseSchema.parse({ status: "ok" });

  return (
    <main className="flex min-h-full flex-col items-center justify-center p-8">
      <h1 className="text-2xl font-semibold tracking-tight">PayScope</h1>
      <p className="mt-2 text-zinc-600">Employee compensation management</p>
      <p className="mt-6 font-mono text-sm text-zinc-500">shared: {health.status}</p>
    </main>
  );
}
