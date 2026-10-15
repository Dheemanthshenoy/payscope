"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { FullPageLoader } from "@/components/full-page-loader";
import { useAuth } from "@/providers/auth-provider";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  return (
    <>
      {status !== "authenticated" ? (
        <div className="fixed inset-0 z-50">
          <FullPageLoader
            label={status === "unauthenticated" ? "Redirecting to sign in" : "Checking session"}
          />
        </div>
      ) : null}
      <AppShell>{children}</AppShell>
    </>
  );
}
