import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  return (
    <div className="mx-auto mt-10 max-w-sm">
      <h1 className="text-xl font-semibold tracking-tight">Admin sign in</h1>
      <p className="mt-1 text-sm text-text-2">
        Everyone can read the dashboard. Editing topics, starting runs and recording decisions needs the admin passcode.
      </p>
      <LoginForm next={next} />
    </div>
  );
}
