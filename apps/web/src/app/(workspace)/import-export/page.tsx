import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ImportExportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import / Export</h1>
        <p className="mt-1 text-sm text-muted-foreground">CSV workflows are scheduled for Milestone 8B.</p>
      </div>
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>Coming next</CardTitle>
          <CardDescription>
            Authenticated CSV import and export already exist on the API. This screen will upload files,
            show row-level errors, and download the current directory.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
