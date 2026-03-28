import { NextResponse } from "next/server";
import type { LegPlan, MatrixResult, MultiStopPlan } from "@/modules/home/types/logistics";

interface OptimizePayload {
  startId: string;
  pickupIds: string[];
  endId: string;
  matrix: MatrixResult;
}

function indexOf(nodeIds: string[], id: string) {
  const index = nodeIds.indexOf(id);
  return index;
}

function nearestNeighborSequence(payload: OptimizePayload) {
  const { startId, pickupIds, endId, matrix } = payload;
  const remaining = new Set(pickupIds);
  const sequence: string[] = [startId];
  let current = startId;

  while (remaining.size) {
    let bestId: string | null = null;
    let bestDuration = Number.POSITIVE_INFINITY;

    for (const candidate of remaining) {
      const a = indexOf(matrix.nodeIds, current);
      const b = indexOf(matrix.nodeIds, candidate);
      if (a < 0 || b < 0) continue;
      const duration = matrix.durationMatrixMinutes[a][b];
      if (duration < bestDuration) {
        bestDuration = duration;
        bestId = candidate;
      }
    }

    if (!bestId) break;
    remaining.delete(bestId);
    sequence.push(bestId);
    current = bestId;
  }

  sequence.push(endId);
  return sequence;
}

function buildLegs(sequence: string[], matrix: MatrixResult) {
  const legs: LegPlan[] = [];
  let totalDistanceKm = 0;
  let totalDurationMinutes = 0;

  for (let i = 0; i < sequence.length - 1; i += 1) {
    const fromId = sequence[i];
    const toId = sequence[i + 1];
    const fromIndex = indexOf(matrix.nodeIds, fromId);
    const toIndex = indexOf(matrix.nodeIds, toId);
    if (fromIndex < 0 || toIndex < 0) continue;

    const leg: LegPlan = {
      fromId,
      toId,
      distanceKm: matrix.distanceMatrixKm[fromIndex][toIndex],
      durationMinutes: matrix.durationMatrixMinutes[fromIndex][toIndex],
    };

    legs.push(leg);
    totalDistanceKm += leg.distanceKm;
    totalDurationMinutes += leg.durationMinutes;
  }

  const plan: MultiStopPlan = {
    sequence,
    legs,
    totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
    totalDurationMinutes,
  };

  return plan;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as OptimizePayload | null;

  if (!body?.startId || !body?.endId || !body?.matrix || !Array.isArray(body.pickupIds)) {
    return NextResponse.json({ error: "Invalid optimization payload" }, { status: 400 });
  }

  if (!body.pickupIds.length) {
    return NextResponse.json({ error: "At least one pickup is required" }, { status: 400 });
  }

  const sequence = nearestNeighborSequence(body);
  const plan = buildLegs(sequence, body.matrix);
  return NextResponse.json(plan);
}
