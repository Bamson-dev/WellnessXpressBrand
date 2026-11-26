import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/auth";
import { adminConfigured } from "@/lib/session";
import LoginForm from "@/components/admin/LoginForm";

export const metadata = { title: "Sign in" };

export default async function Login() {
  if (await currentAdmin()) redirect("/admin");
  return (
    <div className="mx-auto mt-16 max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 shadow-card">
      <h1 className="text-2xl">Admin sign in</h1>
      <p className="mt-1 text-sm text-neutral-600">WellnessXpressBrand store dashboard</p>
      {adminConfigured() ? <LoginForm /> : (
        <p className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Admin access is not set up yet. Add ADMIN_EMAIL and ADMIN_PASSWORD (at least 10 characters) to the app&apos;s environment variables in Coolify, then redeploy.</p>
      )}
    </div>
  );
}
