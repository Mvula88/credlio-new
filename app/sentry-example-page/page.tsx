"use client";

import { useState } from "react";
import * as Sentry from "@sentry/nextjs";

export default function SentryExamplePage() {
  const [message, setMessage] = useState("");

  const testClientError = () => {
    try {
      throw new Error("Test Client Error - This is a test error for Sentry");
    } catch (error) {
      Sentry.captureException(error);
      setMessage("Client error sent to Sentry!");
    }
  };

  const testApiError = async () => {
    try {
      const response = await fetch("/api/sentry-example-api");
      if (!response.ok) {
        setMessage("API error sent to Sentry!");
      }
    } catch (error) {
      Sentry.captureException(error);
      setMessage("Failed to call API");
    }
  };

  const testUnhandledError = () => {
    // This will trigger the error boundary
    throw new Error("Test Unhandled Error - This will trigger the error boundary");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold mb-8">Sentry Test Page</h1>
      
      <p className="text-gray-600 mb-8 max-w-md text-center">
        Use the buttons below to test different error scenarios with Sentry.
        Make sure you have configured your NEXT_PUBLIC_SENTRY_DSN in the .env file.
      </p>

      <div className="space-y-4">
        <button
          onClick={testClientError}
          className="px-6 py-3 bg-blue-500 text-white rounded hover:bg-blue-600 w-64"
        >
          Test Client Error
        </button>

        <button
          onClick={testApiError}
          className="px-6 py-3 bg-green-500 text-white rounded hover:bg-green-600 w-64"
        >
          Test API Error
        </button>

        <button
          onClick={testUnhandledError}
          className="px-6 py-3 bg-red-500 text-white rounded hover:bg-red-600 w-64"
        >
          Test Unhandled Error (Will crash page)
        </button>
      </div>

      {message && (
        <div className="mt-8 p-4 bg-gray-100 rounded">
          <p className="text-gray-800">{message}</p>
        </div>
      )}

      <div className="mt-12 p-4 bg-yellow-50 border border-yellow-200 rounded max-w-md">
        <p className="text-sm text-yellow-800">
          <strong>Note:</strong> Remember to add your Sentry DSN to the .env file:
          <br />
          <code className="text-xs">NEXT_PUBLIC_SENTRY_DSN=your-dsn-here</code>
        </p>
      </div>
    </div>
  );
}