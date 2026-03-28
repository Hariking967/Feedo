"use client";

import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { FaGoogle } from "react-icons/fa";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { OctagonAlertIcon } from "lucide-react";
import Link from "next/link";

import { authClient } from "@/lib/auth-client";
import { ShieldCheck, Clock, Sparkles } from "lucide-react";

const formSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, { message: "Password is required" }),
});

export default function SignInView() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [role, setRole] = useState<"consumer" | "supplier">("consumer");
  const [supplierType, setSupplierType] = useState<"solo" | "catering">("solo");
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    setError(null);
    setPending(true);
    authClient.signIn.email(
      {
        email: data.email,
        password: data.password,
        callbackURL: "/",
      },
      {
        onSuccess: () => {
          setPending(false);
          router.push("/");
        },
        onError: ({ error }) => {
          setError(error.message);
        },
      },
    );
  };

  const onSocial = (provider: "google") => {
    setError(null);
    setPending(true);
    authClient.signIn.social(
      {
        provider: provider,
        callbackURL: "/",
      },
      {
        onSuccess: () => {
          setPending(false);
          // router.push('/')
        },
        onError: ({ error }) => {
          setError(error.message);
        },
      },
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f7fbf5] via-[#f4f0e7] to-[#eef3ed] text-[#1a1c1a]">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
        <div className="text-center space-y-2">
          <span className="inline-flex items-center justify-center rounded-full bg-[#e6f2e3] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#2d5a27]">
            Smart Food Rescue
          </span>
          <h1 className="text-3xl md:text-4xl font-extrabold text-[#1f2a1a]">
            Sign in to Feedo
          </h1>
          <p className="text-sm text-[#565c53]">
            {role === "consumer"
              ? "Rejoin as a consumer to reserve nearby surplus quickly."
              : "Sign in as a supplier—keep listings capped and fast-moving."}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-5">
          <Card className="md:col-span-3 border-[#e5e8e1] bg-white/85 backdrop-blur shadow-xl">
            <CardContent className="p-6 md:p-8">
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-5"
                >
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2d5a27]">
                      Welcome back
                    </p>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-sm text-[#565c53]">
                        {role === "consumer"
                          ? "Defaulting to consumer. Switch if you need to post surplus."
                          : "Supplier mode enabled. Share what type of supplier you are."}
                      </p>
                      <button
                        type="button"
                        className="text-xs font-semibold text-[#2d5a27] underline underline-offset-4"
                        onClick={() =>
                          setRole((prev) =>
                            prev === "consumer" ? "supplier" : "consumer",
                          )
                        }
                      >
                        {role === "consumer"
                          ? "Click here for Supplier"
                          : "Switch to Consumer"}
                      </button>
                    </div>
                    {role === "supplier" && (
                      <div className="mt-2 flex gap-2">
                        {[
                          { key: "solo", label: "Solo" },
                          { key: "catering", label: "Catering service" },
                        ].map((opt) => (
                          <button
                            key={opt.key}
                            type="button"
                            className={`flex-1 rounded-full border px-3 py-2 text-xs font-semibold transition ${
                              supplierType === opt.key
                                ? "bg-[#2d5a27] text-white border-[#2d5a27]"
                                : "bg-white text-[#2d5a27] border-[#d7dcd4] hover:bg-[#f2f5f0]"
                            }`}
                            onClick={() =>
                              setSupplierType(opt.key as typeof supplierType)
                            }
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-4">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[#2d5a27] font-semibold">
                            Email
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="cook@kitchen.com"
                              className="bg-[#f5f7f3] border border-[#d7dcd4] focus:border-[#2d5a27] focus:ring-2 focus:ring-[#b2e3a6]"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[#2d5a27] font-semibold">
                            Password
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="••••••••"
                              className="bg-[#f5f7f3] border border-[#d7dcd4] focus:border-[#2d5a27] focus:ring-2 focus:ring-[#b2e3a6]"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {!!error && (
                    <Alert className="border-none bg-[#ffe7e7] text-[#7a1111]">
                      <OctagonAlertIcon className="h-4 w-4" />
                      <AlertTitle>{error}</AlertTitle>
                    </Alert>
                  )}

                  <Button
                    disabled={pending}
                    className="w-full bg-[#2d5a27] hover:bg-[#254a21] text-white font-semibold shadow-lg shadow-[#2d5a27]/15"
                    type="submit"
                  >
                    Sign In
                  </Button>

                  <div className="relative text-center text-sm text-[#565c53]">
                    <span className="bg-white px-3 relative z-10">
                      Or continue with
                    </span>
                    <span className="absolute left-0 right-0 top-1/2 -translate-y-1/2 border-t border-[#e5e8e1]" />
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <Button
                      disabled={pending}
                      onClick={() => onSocial("google")}
                      variant="outline"
                      type="button"
                      className="w-full border-[#d7dcd4] text-[#2d5a27] hover:bg-[#f2f5f0]"
                    >
                      <FaGoogle className="mr-2" /> Google
                    </Button>
                  </div>

                  <div className="text-center text-sm text-[#454745]">
                    Don&apos;t have an account?{" "}
                    <Link
                      className="font-semibold text-[#2d5a27] underline underline-offset-4"
                      href="/auth/sign-up"
                    >
                      Sign up
                    </Link>
                  </div>
                  <p className="text-center text-xs text-[#7b7f78]">
                    By continuing you agree to our Terms of Service and Privacy
                    Policy.
                  </p>
                </form>
              </Form>
            </CardContent>
          </Card>

          <div className="md:col-span-2 rounded-3xl bg-gradient-to-br from-[#2d5a27] via-[#2f6028] to-[#f57c00] text-white p-6 shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/asfalt-dark.png')] opacity-10" />
            <div className="relative space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em]">
                Trust & Safeguards
              </div>
              <h3 className="text-2xl font-extrabold leading-snug">
                Genuine surplus, capped prices, rapid pickups.
              </h3>
              <p className="text-sm text-white/85">
                Individuals are rate-limited and capped at 50% of market value.
                Bulk kitchens can schedule delivery for NGOs.
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5">
                    {" "}
                    <ShieldCheck className="h-5 w-5 text-white" />{" "}
                  </span>
                  <div>
                    <p className="font-semibold">50% price ceiling</p>
                    <p className="text-white/80">
                      No incentive to cook for profit—only genuine surplus gets
                      listed.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5">
                    {" "}
                    <Clock className="h-5 w-5 text-white" />{" "}
                  </span>
                  <div>
                    <p className="font-semibold">Tight expiry windows</p>
                    <p className="text-white/80">
                      Posts require near-term pickup to keep freshness and
                      honesty.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5">
                    {" "}
                    <Sparkles className="h-5 w-5 text-white" />{" "}
                  </span>
                  <div>
                    <p className="font-semibold">Pattern detection</p>
                    <p className="text-white/80">
                      Repeated identical posts from individuals are flagged and
                      throttled.
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm font-semibold">
                <div className="rounded-2xl bg-white/15 p-3">
                  <p className="text-white/80 text-xs">Food saved</p>
                  <p className="text-xl">42kg this month</p>
                </div>
                <div className="rounded-2xl bg-white/15 p-3">
                  <p className="text-white/80 text-xs">Community</p>
                  <p className="text-xl">28 families impacted</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
