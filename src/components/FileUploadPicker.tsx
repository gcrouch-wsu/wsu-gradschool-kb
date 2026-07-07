"use client";

import { FileText, UploadCloud, X } from "lucide-react";
import { useEffect, useRef } from "react";

type FileUploadPickerProps = {
  accept?: string;
  browseLabel?: string;
  disabled?: boolean;
  file: File | null;
  helperText: string;
  id: string;
  label?: string;
  onError?: (message: string) => void;
  onFileChange: (file: File | null) => void;
  removeLabel?: string;
  replaceLabel?: string;
  title?: string;
  validateFile?: (file: File) => string | null;
};

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileUploadPicker({
  accept,
  browseLabel = "Browse files",
  disabled = false,
  file,
  helperText,
  id,
  label = "File",
  onError,
  onFileChange,
  removeLabel = "Remove selected file",
  replaceLabel = "Choose another",
  title = "Choose a file or drag it here",
  validateFile,
}: FileUploadPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file && inputRef.current) inputRef.current.value = "";
  }, [file]);

  function handleSelectedFile(nextFile: File | null) {
    if (!nextFile) {
      onFileChange(null);
      return;
    }

    const validationError = validateFile?.(nextFile);
    if (validationError) {
      onFileChange(null);
      if (inputRef.current) inputRef.current.value = "";
      onError?.(validationError);
      return;
    }

    onFileChange(nextFile);
  }

  function clearSelectedFile() {
    onFileChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="file-upload-picker">
      <span className="meta">{label}</span>
      <label
        className="file-upload-picker__dropzone"
        htmlFor={id}
        onDragOver={(event) => {
          if (!disabled) event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (!disabled) handleSelectedFile(event.dataTransfer.files?.[0] ?? null);
        }}
      >
        <input
          accept={accept}
          className="file-upload-picker__input"
          disabled={disabled}
          id={id}
          onChange={(event) => handleSelectedFile(event.target.files?.[0] ?? null)}
          ref={inputRef}
          type="file"
        />
        <span className="file-upload-picker__icon" aria-hidden>
          {file ? <FileText size={24} strokeWidth={1.75} /> : <UploadCloud size={24} strokeWidth={1.75} />}
        </span>
        <span className="file-upload-picker__content">
          <span className="file-upload-picker__title">{file ? file.name : title}</span>
          <span className="file-upload-picker__hint">
            {file ? `${formatFileSize(file.size)} selected` : helperText}
          </span>
        </span>
        <span className="file-upload-picker__action">{file ? replaceLabel : browseLabel}</span>
      </label>
      {file && (
        <button className="file-upload-picker__clear" disabled={disabled} onClick={clearSelectedFile} type="button">
          <X aria-hidden size={16} strokeWidth={1.75} />
          {removeLabel}
        </button>
      )}
    </div>
  );
}
