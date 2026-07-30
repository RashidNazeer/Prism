import { useId, useRef, useState } from 'react';
import { ImageIcon, Trash2, Upload } from 'lucide-react';
import { Label } from '@/components/ui/Field';
import { cn } from '@/lib/utils';
import { ACCEPTED_TYPES, useImageUpload } from '@/lib/admin/useImageUpload';

/**
 * Pick an image, see it, replace it, remove it.
 *
 * The value handed back is the public URL of the uploaded file, so the forms
 * around this only ever deal in a string. Uploading happens the moment a file
 * is chosen rather than on submit: an admin who picks a photo and then sees
 * nothing has no idea whether it worked.
 *
 * The file input is hidden but present, and the visible control is a real
 * button that clicks it. A `sr-only` input can be tabbed to, but its focus ring
 * is invisible, which is a keyboard trap in all but name.
 */
export function ImageUploadField({
  label,
  hint,
  folder,
  value,
  onChange,
  disabled,
  shape = 'square',
}: {
  label: string;
  hint?: string;
  /** Where in the bucket this lives, e.g. `brands/<id>`. */
  folder: string;
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
  /** Logos read better round; product shots do not. */
  shape?: 'square' | 'round';
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const upload = useImageUpload();
  const busy = disabled || upload.isPending;

  const pick = (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    upload.mutate(
      { file, folder },
      {
        onSuccess: (url) => onChange(url),
        onError: (e) => setProblem((e as Error).message),
      }
    );
    // Clear it, or choosing the same file twice in a row fires no change event
    // and the screen appears frozen.
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>

      <div className="mt-2 flex flex-wrap items-center gap-4">
        <span
          className={cn(
            'grid size-20 shrink-0 place-items-center overflow-hidden border border-line bg-surface-2',
            shape === 'round' ? 'rounded-full' : 'rounded-xl'
          )}
        >
          {value ? (
            <img
              src={value}
              alt=""
              className="size-full object-cover"
              // A broken URL should look empty, not like a broken page.
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <ImageIcon size={20} aria-hidden className="text-faint" />
          )}
        </span>

        <div className="flex min-w-0 flex-wrap gap-2">
          <button
            type="button"
            id={id}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-line-interactive bg-surface-2 px-4 text-[13px] font-medium transition-colors duration-200 hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Upload size={15} aria-hidden />
            {upload.isPending ? 'Uploading...' : value ? 'Replace' : 'Choose image'}
          </button>

          {value ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setProblem(null);
                onChange(null);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-[13px] text-muted transition-colors duration-200 hover:text-danger disabled:opacity-60"
            >
              <Trash2 size={15} aria-hidden />
              Remove
            </button>
          ) : null}

          <input
            ref={inputRef}
            type="file"
            tabIndex={-1}
            aria-hidden
            accept={ACCEPTED_TYPES.join(',')}
            className="sr-only"
            onChange={(e) => pick(e.target.files?.[0])}
          />
        </div>
      </div>

      {problem ? (
        <p role="alert" className="mt-2 text-[13px] text-danger">
          {problem}
        </p>
      ) : hint ? (
        <p className="mt-2 text-[13px] text-faint">{hint}</p>
      ) : null}
    </div>
  );
}
