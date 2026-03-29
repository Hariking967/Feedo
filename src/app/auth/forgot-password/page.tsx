import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-md">
        <Card className="border-slate-200 bg-white shadow-md">
          <CardContent className="p-6 space-y-4">
            <h1 className="text-xl font-bold text-slate-900">Forgot password</h1>
            <p className="text-sm text-slate-600">Enter your email and we will send a reset link.</p>
            <Input type="email" placeholder="name@org.com" />
            <Button className="w-full">Send reset link</Button>
            <p className="text-center text-sm text-slate-600">Back to <Link href="/auth/sign-in" className="font-semibold text-emerald-700">Sign in</Link></p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
