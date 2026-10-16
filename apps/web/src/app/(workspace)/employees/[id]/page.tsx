import { Suspense } from "react";
import { EmployeeDetailPage } from "./employee-detail";
import { Skeleton } from "@/components/ui/skeleton";

function EmployeeDetailFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-40" />
      <Skeleton className="h-64" />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<EmployeeDetailFallback />}>
      <EmployeeDetailPage />
    </Suspense>
  );
}
