import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, Check, X } from "lucide-react";

interface ImageCropperProps {
  imageSrc: string;
  onCropComplete: (croppedBlob: Blob) => void;
  onCancel: () => void;
}

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = reject;
    image.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob failed"));
      },
      "image/jpeg",
      0.9
    );
  });
}

export function ImageCropper({ imageSrc, onCropComplete, onCancel }: ImageCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropChange = useCallback((location: { x: number; y: number }) => {
    setCrop(location);
  }, []);

  const onZoomChange = useCallback((z: number) => {
    setZoom(z);
  }, []);

  const onCropAreaComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleSave = async () => {
    if (!croppedAreaPixels) return;
    const blob = await getCroppedImg(imageSrc, croppedAreaPixels);
    onCropComplete(blob);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col" data-testid="image-cropper-overlay">
      <div className="flex items-center justify-between p-4 bg-black/60">
        <Button variant="ghost" size="sm" onClick={onCancel} className="text-white hover:bg-white/20" data-testid="button-crop-cancel">
          <X className="w-5 h-5" />
        </Button>
        <p className="text-white text-sm font-medium">Juster bildet</p>
        <Button variant="ghost" size="sm" onClick={handleSave} className="text-white hover:bg-white/20" data-testid="button-crop-save">
          <Check className="w-5 h-5" />
        </Button>
      </div>

      <div className="relative flex-1">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={onCropChange}
          onZoomChange={onZoomChange}
          onCropComplete={onCropAreaComplete}
          minZoom={0.5}
          maxZoom={5}
        />
      </div>

      <div className="flex items-center justify-center gap-4 p-4 bg-black/60">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setZoom(Math.max(0.5, zoom - 0.2))}
          className="text-white hover:bg-white/20"
          data-testid="button-zoom-out"
        >
          <ZoomOut className="w-5 h-5" />
        </Button>
        <input
          type="range"
          min={0.5}
          max={5}
          step={0.1}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-40 accent-white"
          data-testid="input-zoom-slider"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setZoom(Math.min(5, zoom + 0.2))}
          className="text-white hover:bg-white/20"
          data-testid="button-zoom-in"
        >
          <ZoomIn className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
