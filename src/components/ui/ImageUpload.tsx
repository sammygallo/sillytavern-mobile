import { useRef, useState } from 'react';
import { Upload, X, Crop } from 'lucide-react';
import { Button } from './Button';
import { ImageCropModal } from './ImageCropModal';

interface ImageUploadProps {
  currentImage?: string;
  onImageSelect: (file: File | null) => void;
  label?: string;
}

export function ImageUpload({ currentImage, onImageSelect, label = 'Avatar' }: ImageUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openCrop = (dataUrl: string) => setCropSrc(dataUrl);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      openCrop(dataUrl);
    };
    reader.readAsDataURL(file);

    // Reset so re-selecting same file fires change again
    e.target.value = '';
  };

  const handleCropConfirm = (file: File) => {
    setCropSrc(null);
    const url = URL.createObjectURL(file);
    // Revoke previous blob URL to avoid leaks
    if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
    setPreview(url);
    onImageSelect(file);
  };

  const handleClear = () => {
    if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
    setPreview(null);
    onImageSelect(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const displayImage = preview || currentImage;

  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">
        {label}
      </label>

      <div className="flex items-start gap-4">
        {/* Preview — click to open file picker */}
        <div className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Click to upload or change image"
            className={`
              w-24 h-24 rounded-lg border-2 border-dashed
              ${displayImage ? 'border-[var(--color-primary)]' : 'border-[var(--color-border)]'}
              bg-[var(--color-bg-tertiary)]
              flex items-center justify-center
              overflow-hidden group relative
            `}
          >
            {displayImage ? (
              <>
                <img
                  src={displayImage}
                  alt="Avatar preview"
                  className="w-full h-full object-cover"
                />
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Crop size={20} className="text-white" />
                </div>
              </>
            ) : (
              <Upload size={24} className="text-[var(--color-text-secondary)]" />
            )}
          </button>

          {/* Clear button */}
          {preview && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute -top-2 -right-2 p-1 bg-red-500 rounded-full text-white hover:bg-red-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Upload / re-crop controls */}
        <div className="flex-1 flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={16} className="mr-2" />
            {displayImage ? 'Change Image' : 'Upload Image'}
          </Button>

          {displayImage && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => openCrop(displayImage)}
            >
              <Crop size={16} className="mr-2" />
              Crop
            </Button>
          )}

          <p className="text-xs text-[var(--color-text-secondary)]">
            PNG, JPG, or GIF. Will be resized to 400x600.
          </p>
        </div>
      </div>

      {cropSrc && (
        <ImageCropModal
          imageSrc={cropSrc}
          onConfirm={handleCropConfirm}
          onClose={() => setCropSrc(null)}
        />
      )}
    </div>
  );
}
