"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { ArrowRight, Lock, Mail, OctagonAlertIcon, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { authClient } from "@/lib/auth-client";

const schema = z
  .object({
    name: z.string().min(2, "Name is required"),
    email: z.string().email("Valid email required"),
    password: z.string().min(6, "At least 6 characters"),
    confirmPassword: z.string().min(6, "At least 6 characters"),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

const POST_AUTH_LANDING_ROUTE = "/";

export default function SignUpView() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof schema>) => {
    setPending(true);
    setError(null);

    try {
      const result = await authClient.signUp.email({
        name: values.name,
        email: values.email,
        password: values.password,
        callbackURL: POST_AUTH_LANDING_ROUTE,
      });

      if (result?.error) {
        setError(result.error.message ?? "Unable to create account right now.");
        return;
      }

      if (typeof window !== "undefined") {
        window.location.assign(POST_AUTH_LANDING_ROUTE);
        return;
      }

      router.replace(POST_AUTH_LANDING_ROUTE);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create account right now. Please try again.";
      setError(message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_8%_12%,#bbf7d0_0%,#f8fafc_34%,#cffafe_68%,#e2e8f0_100%)] px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-8 h-72 w-72 rounded-full bg-emerald-300/35 blur-3xl" />
        <div className="absolute right-0 top-24 h-80 w-80 rounded-full bg-cyan-300/30 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-amber-200/35 blur-3xl" />
      </div>

      <div className="relative mx-auto grid max-w-6xl gap-5 md:grid-cols-[1.1fr_0.9fr]">
        <Card className="overflow-hidden border-emerald-200 bg-gradient-to-br from-emerald-700 via-teal-700 to-cyan-700 text-white shadow-[0_30px_90px_rgba(6,95,70,0.4)]">
          <CardContent className="p-7 md:p-10">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-widest">
              <Sparkles className="size-3.5" /> Feedo Network
            </p>
            <h1 className="mt-4 text-3xl font-black leading-tight md:text-4xl">Create your rescue account</h1>
            <p className="mt-3 max-w-xl text-sm text-white/90 md:text-base">
              One account gives you access to live food rescue actions, listing operations, and volunteer coordination.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/35 bg-white/10 p-3">
                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/80">
                  <UserRound className="size-3.5" /> Fast onboarding
                </p>
                <p className="mt-1 text-sm font-semibold">Register in under a minute with core details only.</p>
              </div>
              <div className="rounded-xl border border-white/35 bg-white/10 p-3">
                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/80">
                  <ShieldCheck className="size-3.5" /> Secure by default
                </p>
                <p className="mt-1 text-sm font-semibold">Protected auth flow with persistent session handling.</p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-white/25 bg-black/10 p-2">
                <p className="text-[10px] uppercase tracking-wide text-white/80">Onboarding</p>
                <p className="text-lg font-black">60s</p>
              </div>
              <div className="rounded-lg border border-white/25 bg-black/10 p-2">
                <p className="text-[10px] uppercase tracking-wide text-white/80">Roles</p>
                <p className="text-lg font-black">3</p>
              </div>
              <div className="rounded-lg border border-white/25 bg-black/10 p-2">
                <p className="text-[10px] uppercase tracking-wide text-white/80">Coverage</p>
                <p className="text-lg font-black">24/7</p>
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-white/35 bg-black/15 p-3 text-sm">
              Already have an account? <Link href="/auth/sign-in" className="font-semibold text-amber-200">Sign in and continue your rescue workflow</Link>.
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/60 bg-white/85 shadow-[0_20px_60px_rgba(15,23,42,0.15)] backdrop-blur">
          <CardContent className="p-6 md:p-8">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-slate-900">Create account</h2>
              <span className="text-2xl">📝</span>
            </div>
            <p className="mt-2 text-sm text-slate-600">Use your name, email, and password to get started. You can switch between app modes after login.</p>

            <Form {...form}>
              <form className="mt-7 space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-700 font-semibold flex items-center gap-2">
                      <UserRound className="size-4 text-emerald-600" />
                      Full Name
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="text"
                        placeholder="Your full name"
                        className="bg-slate-900 text-white placeholder:text-slate-400 border-slate-700 focus:border-emerald-500 focus:ring-emerald-500/20 h-10 px-4"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-700 font-semibold flex items-center gap-2">
                      <Mail className="size-4 text-emerald-600" />
                      Email Address
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="yourname@email.com"
                        className="bg-slate-900 text-white placeholder:text-slate-400 border-slate-700 focus:border-emerald-500 focus:ring-emerald-500/20 h-10 px-4"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField control={form.control} name="password" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-700 font-semibold flex items-center gap-2">
                        <Lock className="size-4 text-emerald-600" />
                        Password
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          placeholder="••••••••••"
                          className="bg-slate-900 text-white placeholder:text-slate-400 border-slate-700 focus:border-emerald-500 focus:ring-emerald-500/20 h-10 px-4"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="confirmPassword" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-700 font-semibold flex items-center gap-2">
                        <Lock className="size-4 text-emerald-600" />
                        Confirm Password
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          placeholder="••••••••••"
                          className="bg-slate-900 text-white placeholder:text-slate-400 border-slate-700 focus:border-emerald-500 focus:ring-emerald-500/20 h-10 px-4"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {error ? (
                  <Alert className="border-rose-200 bg-rose-50 text-rose-700 flex items-start gap-2">
                    <OctagonAlertIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <AlertTitle>{error}</AlertTitle>
                  </Alert>
                ) : null}

                <Button disabled={pending} type="submit" className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 h-10 text-base">
                  {pending ? "Creating account..." : "Create account"}
                  {!pending ? <ArrowRight className="size-4" /> : null}
                </Button>

                <p className="text-center text-sm text-slate-600">
                  Already have an account? <Link href="/auth/sign-in" className="font-semibold text-emerald-700 hover:text-emerald-800 underline">Sign in</Link>
                </p>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
