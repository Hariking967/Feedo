import { PublicNavbar } from "@/components/platform/layout/public-navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function ProfilePage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <PublicNavbar />
      <section className="mx-auto max-w-3xl px-4 py-8">
        <Card className="border-slate-200 bg-white">
          <CardContent className="space-y-4 p-6">
            <h1 className="text-2xl font-bold text-slate-900">Profile and Settings</h1>
            <div className="grid gap-4 md:grid-cols-2">
              <div><Label>Name</Label><Input defaultValue="Operations User" /></div>
              <div><Label>Email</Label><Input defaultValue="ops@foodrescue.org" /></div>
              <div><Label>Role</Label><Input defaultValue="Admin" /></div>
              <div><Label>Notification preference</Label><Input defaultValue="All alerts" /></div>
            </div>
            <Button>Save settings</Button>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
