import { useState, type ComponentPropsWithoutRef } from "react";
import { Eye, EyeOff } from "lucide-react";

type AuthFieldProps = ComponentPropsWithoutRef<"input"> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
};

function AuthField({
  id,
  label,
  error,
  hint,
  type = "text",
  disabled,
  ...inputProps
}: AuthFieldProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const isPassword = type === "password";
  const description = [hint && `${id}-hint`, error && `${id}-error`]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm">
        {label}
      </label>
      <div className="relative">
        <input
          {...inputProps}
          id={id}
          type={isPassword && passwordVisible ? "text" : type}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={description || undefined}
          className={`min-h-12 w-full rounded-sm border bg-transparent px-3.5 py-3 text-base text-ink transition-colors placeholder:text-muted-ink/80 hover:border-muted-ink focus:border-ink focus:bg-specimen-paper/40 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none ${
            error ? "border-ink border-dashed" : "border-specimen-line"
          } ${isPassword ? "pr-14" : ""}`}
        />
        {isPassword && (
          <button
            type="button"
            aria-label={passwordVisible ? "Hide password" : "Show password"}
            aria-controls={id}
            disabled={disabled}
            onClick={() => setPasswordVisible((visible) => !visible)}
            className="absolute inset-y-1 right-1 flex w-11 cursor-pointer items-center justify-center rounded-sm text-muted-ink transition-colors hover:bg-specimen-paper hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
          >
            {passwordVisible ? (
              <EyeOff size={18} aria-hidden="true" />
            ) : (
              <Eye size={18} aria-hidden="true" />
            )}
          </button>
        )}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="mt-2 text-xs leading-relaxed text-muted-ink">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm leading-relaxed">
          <span className="font-medium">Please check:</span> {error}
        </p>
      )}
    </div>
  );
}

export default AuthField;
