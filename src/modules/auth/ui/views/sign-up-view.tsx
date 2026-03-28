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

const formSchema = z
  .object({
    name: z.string().min(1, { message: "Name is required" }),
    email: z.string().email(),
    password: z.string().min(1, { message: "Password is required" }),
    confirmPassword: z.string().min(1, { message: "Password is required" }),
  })
  .refine((data) => data.password == data.confirmPassword, {
    message: "Password don't match",
    path: ["confirmPassword"],
  });

export default function SignUpView() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [role, setRole] = useState<"consumer" | "supplier">("consumer");
  const [supplierType, setSupplierType] = useState<"solo" | "catering">("solo");
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    setError(null);
    setPending(true);
    authClient.signUp.email(
      {
        name: data.name,
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
          <span className="inline-flex items-center justify-center rounded-full bg-[#ffe7a6] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#5e2c00]">
            Join the rescue network
          </span>
          <h1 className="text-3xl md:text-4xl font-extrabold text-[#1f2a1a]">
            Create your Feedo account
          </h1>
          <p className="text-sm text-[#565c53]">
            {role === "consumer"
              ? "Sign up as a consumer by default. Switch to supplier if you need to post."
              : "Supplier mode: capped pricing, short expiry, and quick pickups."}
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
                      Get started
                    </p>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-sm text-[#565c53]">
                        {role === "consumer"
                          ? "You are set as consumer. Switch to supplier to post surplus."
                          : "Supplier mode enabled. Tell us if you are solo or catering."}
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
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[#2d5a27] font-semibold">
                            Name
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="text"
                              placeholder="Priya Sharma"
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

                    <FormField
                      control={form.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[#2d5a27] font-semibold">
                            Confirm Password
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
                    Create account
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
                    Already have an account?{" "}
                    <Link
                      className="font-semibold text-[#2d5a27] underline underline-offset-4"
                      href="/auth/sign-in"
                    >
                      Sign in
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

          <div className="md:col-span-2 rounded-3xl bg-gradient-to-br from-[#f57c00] via-[#ffb300] to-[#ffe7a6] text-[#2d1700] p-6 shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/asfalt-dark.png')] opacity-10" />
            <div className="relative space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/40 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#5e2c00]">
                Safeguards in place
              </div>
              <h3 className="text-2xl font-extrabold leading-snug">
                Keep surplus honest, fresh, and accessible.
              </h3>
              <p className="text-sm text-[#4a3a16]">
                Individuals have stricter limits; bulk providers can move larger
                drops with delivery support for NGOs.
              </p>
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="h-5 w-5 text-[#5e2c00] mt-0.5" />
                  <div>
                    <p className="font-semibold">50% price cap</p>
                    <p className="text-[#4a3a16]">
                      Stops profiteering; ensures genuine surplus only.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-[#5e2c00] mt-0.5" />
                  <div>
                    <p className="font-semibold">Short expiry windows</p>
                    <p className="text-[#4a3a16]">
                      Posts need near-term pickup—no future bookings.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-[#5e2c00] mt-0.5" />
                  <div>
                    <p className="font-semibold">Pattern detection</p>
                    <p className="text-[#4a3a16]">
                      Repeated identical posts from individuals are
                      automatically flagged.
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm font-semibold">
                <div className="rounded-2xl bg-white/70 p-3 shadow-sm">
                  <p className="text-[#5e2c00]/80 text-xs">Food saved</p>
                  <p className="text-xl text-[#2d5a27]">42kg this month</p>
                </div>
                <div className="rounded-2xl bg-white/70 p-3 shadow-sm">
                  <p className="text-[#5e2c00]/80 text-xs">Impact</p>
                  <p className="text-xl text-[#2d5a27]">28 families served</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
