import { useDropzone } from "react-dropzone";

const MAX_MB = 15;

export function UploadDropzone({ onFile, disabled }: { onFile: (file: File) => void; disabled?: boolean }) {
  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    accept: { "image/jpeg": [], "image/png": [], "image/webp": [] },
    maxSize: MAX_MB * 1024 * 1024,
    multiple: false,
    disabled,
    onDropAccepted: (files) => files[0] && onFile(files[0]),
  });
  const rejection = fileRejections[0]?.errors[0];
  const rejectionText =
    rejection?.code === "file-too-large" ? `That image is over ${MAX_MB} MB.` : rejection ? "Please choose a JPEG, PNG, or WebP image." : null;

  return (
    <div>
      <div
        {...getRootProps()}
        className={`flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
          isDragActive ? "border-sepia bg-parchment-deep" : "border-rule bg-card hover:border-sepia"
        } ${disabled ? "pointer-events-none opacity-60" : ""}`}
      >
        <input {...getInputProps()} aria-label="Upload a letter image" />
        <p className="font-medium">{isDragActive ? "Drop the image here" : "Drag a scan here, or click to choose a file"}</p>
        <p className="mt-1 text-sm text-ink-soft">JPEG, PNG, or WebP, up to {MAX_MB} MB</p>
      </div>
      {rejectionText && <p className="mt-2 text-sm text-sepia-dark" role="alert">{rejectionText}</p>}
    </div>
  );
}
