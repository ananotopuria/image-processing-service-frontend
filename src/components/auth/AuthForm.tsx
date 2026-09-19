import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { getAuthErrorMessage } from "../../api/errors";
import { useAuth } from "../../auth/useAuth";
import AuthField from "./AuthField";

type FieldName = "username" | "email" | "password";
type FieldErrors = Partial<Record<FieldName, string>>;

function AuthForm({ mode }: { mode: "login" | "register" }) {
  const isRegister = mode === "register";
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const request = useRef<AbortController | null>(null);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  useEffect(() => () => request.current?.abort(), []);

  function handleChange(event: FormEvent<HTMLFormElement>) {
    const field = event.target as HTMLInputElement;
    setErrors((current) => ({ ...current, [field.name]: undefined }));
    setNotice("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const username = String(data.get("username") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const emailInput = form.elements.namedItem("email") as HTMLInputElement;
    const nextErrors: FieldErrors = {};

    // Keep the length limits aligned with the existing NestJS auth DTOs.
    if (
      isRegister &&
      (Array.from(username).length < 2 || Array.from(username).length > 50)
    ) {
      nextErrors.username = "Use between 2 and 50 characters for your username.";
    }
    if (!email || emailInput.validity.typeMismatch) {
      nextErrors.email = "Enter a valid email address.";
    }
    if (Array.from(password).length < 8) {
      nextErrors.password = "Enter a password with at least 8 characters.";
    } else if (isRegister && Array.from(password).length > 72) {
      nextErrors.password = "Use no more than 72 characters for your password.";
    }

    setErrors(nextErrors);
    setNotice("");

    const firstInvalidField = Object.keys(nextErrors)[0];
    if (firstInvalidField) {
      (form.elements.namedItem(firstInvalidField) as HTMLInputElement).focus();
      return;
    }

    const controller = new AbortController();
    request.current = controller;
    setIsSubmitting(true);
    try {
      if (isRegister) {
        await register({ username, email, password }, controller.signal);
      } else {
        await login({ email, password }, controller.signal);
      }
      if (!controller.signal.aborted) navigate("/studio", { replace: true });
    } catch (error: unknown) {
      if (!controller.signal.aborted) setNotice(getAuthErrorMessage(error));
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setIsSubmitting(false);
    }
  }

  return (
    <form
      className="mt-8"
      noValidate
      onSubmit={handleSubmit}
      onChange={handleChange}
      aria-labelledby="auth-title"
      aria-busy={isSubmitting}
    >
      <div className="space-y-5">
        {isRegister && (
          <AuthField
            id="register-username"
            name="username"
            label="Username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            disabled={isSubmitting}
            hint="2–50 characters."
            error={errors.username}
          />
        )}
        <AuthField
          id={`${mode}-email`}
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@example.com"
          required
          disabled={isSubmitting}
          error={errors.email}
        />
        <AuthField
          id={`${mode}-password`}
          name="password"
          label="Password"
          type="password"
          autoComplete={isRegister ? "new-password" : "current-password"}
          required
          disabled={isSubmitting}
          hint={isRegister ? "Use 8–72 characters." : undefined}
          error={errors.password}
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="group mt-7 flex min-h-12 w-full cursor-pointer items-center justify-between gap-4 rounded-sm border border-ink bg-ink px-5 py-3 font-mono text-xs tracking-[0.08em] text-paper transition-colors hover:bg-ink-hover disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
      >
        {isSubmitting
          ? isRegister ? "CREATING ACCOUNT…" : "SIGNING IN…"
          : isRegister ? "CREATE ACCOUNT" : "SIGN IN"}
        <ArrowRight
          size={18}
          aria-hidden="true"
          className="transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transform-none motion-reduce:transition-none"
        />
      </button>

      <div role="status" aria-atomic="true">
        <span className="sr-only">
          {isSubmitting ? isRegister ? "Creating your account." : "Signing you in." : ""}
        </span>
      </div>
      <div role="alert" aria-atomic="true">
        {notice && (
          <p className="mt-4 border-l-2 border-ink bg-specimen-paper px-4 py-3 text-sm leading-relaxed">
            {notice}
          </p>
        )}
      </div>

      <p className="mt-7 border-t border-archive-line pt-5 text-sm leading-relaxed text-muted-ink">
        {isRegister ? "Already have an account?" : "New to Mothframe?"}{" "}
        <Link
          to={isRegister ? "/login" : "/register"}
          className="inline-flex min-h-11 items-center text-ink underline decoration-ink/40 transition-colors hover:decoration-ink motion-reduce:transition-none"
        >
          {isRegister ? "Sign in." : "Create an account."}
        </Link>
      </p>
    </form>
  );
}

export default AuthForm;
