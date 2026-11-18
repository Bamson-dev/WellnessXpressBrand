"use client";
import { useFormState, useFormStatus } from "react-dom";
import { loginAction } from "@/app/admin/actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button className="admin-btn mt-2 w-full py-3" disabled={pending}>{pending ? "Signing in..." : "Sign in"}</button>;
}
export default function LoginForm() {
  const [state, action] = useFormState(loginAction, null);
  return (
    <form action={action} className="mt-5 space-y-4">
      <div><label htmlFor="email" className="label">Email</label><input id="email" name="email" type="email" autoComplete="username" required className="admin-input py-3" /></div>
      <div><label htmlFor="password" className="label">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required className="admin-input py-3" /></div>
      {state?.error ? <p className="err" role="alert">{state.error}</p> : null}
      <Submit />
    </form>
  );
}
