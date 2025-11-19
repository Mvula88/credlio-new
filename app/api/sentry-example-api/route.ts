import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export async function GET() {
  try {
    // This is a test endpoint to verify Sentry is working
    throw new Error("Sentry Example API Route Error");
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "Sentry Example API Route Error" },
      { status: 500 }
    );
  }
}

// Dynamic route segment config
export const dynamic = "force-dynamic";