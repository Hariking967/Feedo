"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Leaf, Loader2, ShieldCheck, UploadCloud } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SupplierAnalyticsResponse {
  source: "supabase" | "database";
  metrics: {
    mealsContributed: number;
    successfulPickups: number;
    averageResponseMinutes: number;
    peopleServed: number;
    wastePreventedKg: number;
    co2ReductionKg: number;
  };
  trustProfile: {
    score: number;
    level: string;
    components: {
      successfulHandoverRate: number;
      descriptionAccuracyRate: number;
      lowCancellationRate: number;
      verifiedDeliveryRate: number;
      proofCoverageRate: number;
    };
  };
  proofs: {
    count: number;
    bucket: string;
  };
  recentListings: Array<{
    id: string;
    foodName: string;
    status: string;
    quantity: number;
    createdAt: string;
  }>;
}

function componentRows(components: SupplierAnalyticsResponse["trustProfile"]["components"]) {
  return [
    { label: "Successful handovers", value: components.successfulHandoverRate },
    { label: "Description accuracy", value: components.descriptionAccuracyRate },
    { label: "Low cancellation rate", value: components.lowCancellationRate },
    { label: "Verified deliveries", value: components.verifiedDeliveryRate },
    { label: "Proof coverage", value: components.proofCoverageRate },
  ];
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

export default function SupplierAnalyticsPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [payload, setPayload] = useState<SupplierAnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedListingId, setSelectedListingId] = useState<string>("");
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const loadAnalytics = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/supplier/analytics", { cache: "no-store" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "Unable to load analytics");
      }

      const data = (await response.json()) as SupplierAnalyticsResponse;
      setPayload(data);
      setSelectedListingId((current) => current || data.recentListings[0]?.id || "");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to load analytics");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!session?.user?.id) return;
    void loadAnalytics();
  }, [session?.user?.id]);

  const trustRows = useMemo(() => {
    if (!payload) return [];
    return componentRows(payload.trustProfile.components);
  }, [payload]);

  const onUploadProof = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadMessage(null);

    try {
      const imageBase64 = await readFileAsDataUrl(file);
      const response = await fetch("/api/supplier/proof", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageBase64,
          listingId: selectedListingId || undefined,
          mimeType: file.type,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "Unable to upload proof");
      }

      setUploadMessage("Proof uploaded successfully. Analytics refreshed.");
      await loadAnalytics();
    } catch (uploadError) {
      setUploadMessage(uploadError instanceof Error ? uploadError.message : "Unable to upload proof");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  if (isPending) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-6">
          <p className="inline-flex items-center gap-2 text-sm text-slate-600"><Loader2 className="size-4 animate-spin" /> Loading session...</p>
        </div>
      </main>
    );
  }

  if (!session?.user?.id) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-sm text-slate-600">Please sign in to view supplier analytics.</p>
          <Button className="mt-3" onClick={() => router.push("/auth/sign-in")}>Go to sign in</Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#ecfeff_0%,#f8fafc_40%,#f1f5f9_100%)] p-6">
      <section className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-cyan-700">Supplier Impact Analytics</p>
            <h1 className="text-2xl font-black text-slate-900">Your contribution profile</h1>
            <p className="text-sm text-slate-600">Track social impact, environmental benefit, and trust score for every handover.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/")}>
              <ArrowLeft className="size-4" /> Back to workspace
            </Button>
            <Button variant="outline" onClick={() => void loadAnalytics()} disabled={isLoading}>
              {isLoading ? <Loader2 className="size-4 animate-spin" /> : null}
              Refresh
            </Button>
          </div>
        </div>

        {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

        {!payload && isLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <p className="inline-flex items-center gap-2 text-sm text-slate-600"><Loader2 className="size-4 animate-spin" /> Loading analytics...</p>
          </div>
        ) : null}

        {payload ? (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs font-semibold uppercase text-emerald-700">Meals contributed</p>
                <p className="mt-1 text-3xl font-black text-emerald-900">{payload.metrics.mealsContributed}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Successful pickups</p>
                <p className="mt-1 text-3xl font-black text-slate-900">{payload.metrics.successfulPickups}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Avg response</p>
                <p className="mt-1 text-3xl font-black text-slate-900">{payload.metrics.averageResponseMinutes}m</p>
              </div>
              <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
                <p className="text-xs font-semibold uppercase text-cyan-700">People served</p>
                <p className="mt-1 text-3xl font-black text-cyan-900">{payload.metrics.peopleServed}</p>
              </div>
              <div className="rounded-xl border border-lime-200 bg-lime-50 p-4">
                <p className="text-xs font-semibold uppercase text-lime-700">Waste prevented</p>
                <p className="mt-1 text-3xl font-black text-lime-900">{payload.metrics.wastePreventedKg}kg</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Trust profile</p>
                    <h2 className="text-xl font-black text-slate-900">{payload.trustProfile.level} • {payload.trustProfile.score}/100</h2>
                  </div>
                  <ShieldCheck className="size-6 text-emerald-700" />
                </div>

                <div className="mt-4 space-y-2">
                  {trustRows.map((row) => (
                    <div key={row.label}>
                      <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                        <span>{row.label}</span>
                        <span>{row.value}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-200">
                        <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${row.value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Data source: {payload.source}. Trust combines handover success, data quality, cancellation behavior, delivery proof, and verified completion.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Environmental impact</p>
                <h2 className="text-xl font-black text-slate-900">Basic sustainability model</h2>

                <div className="mt-4 space-y-3 text-sm">
                  <div className="rounded-lg border border-lime-200 bg-lime-50 p-3">
                    <p className="font-semibold text-lime-900">Food waste diverted</p>
                    <p className="text-lime-700">{payload.metrics.wastePreventedKg} kg</p>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <p className="font-semibold text-emerald-900">Estimated CO2 avoided</p>
                    <p className="text-emerald-700">{payload.metrics.co2ReductionKg} kg CO2e</p>
                  </div>
                  <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3">
                    <p className="font-semibold text-cyan-900">Proof assets in storage</p>
                    <p className="text-cyan-700">{payload.proofs.count} files ({payload.proofs.bucket})</p>
                  </div>
                </div>

                <p className="mt-3 inline-flex items-center gap-2 text-xs text-slate-600">
                  <Leaf className="size-3.5" /> Model uses meal-to-weight and weight-to-CO2 coefficients for demo-ready estimation.
                </p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Upload proof of pickup / delivery</p>
                <h2 className="text-lg font-black text-slate-900">Supabase Storage proof pipeline</h2>
                <p className="mt-1 text-sm text-slate-600">Attach images to strengthen verified completion and trust score.</p>

                <label className="mt-4 block text-sm font-medium text-slate-700">Listing</label>
                <select
                  value={selectedListingId}
                  onChange={(event) => setSelectedListingId(event.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                >
                  <option value="">General proof (no listing)</option>
                  {payload.recentListings.map((item) => (
                    <option key={item.id} value={item.id}>{item.foodName} • {item.status} • Qty {item.quantity}</option>
                  ))}
                </select>

                <label className="mt-4 block text-sm font-medium text-slate-700">Image file</label>
                <Input type="file" accept="image/*" onChange={onUploadProof} disabled={isUploading} className="mt-1" />

                <div className="mt-3 flex items-center gap-2 text-xs text-slate-600">
                  {isUploading ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
                  <span>{isUploading ? "Uploading proof..." : "Upload image to Supabase Storage and auto-refresh analytics"}</span>
                </div>

                {uploadMessage ? (
                  <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 inline-flex items-center gap-2">
                    <CheckCircle2 className="size-3.5" /> {uploadMessage}
                  </p>
                ) : null}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent supplier listings</p>
                <h2 className="text-lg font-black text-slate-900">Latest activity</h2>
                <div className="mt-3 space-y-2">
                  {payload.recentListings.length ? payload.recentListings.map((item) => (
                    <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                      <p className="font-semibold text-slate-900">{item.foodName}</p>
                      <p className="text-xs text-slate-600">{item.status} • Qty {item.quantity}</p>
                      <p className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</p>
                    </div>
                  )) : <p className="text-sm text-slate-600">No listings yet.</p>}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
