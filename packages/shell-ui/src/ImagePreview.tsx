/**
 * ImagePreview — 画像クリックでフルサイズプレビューモーダル。
 */

interface ImagePreviewProps {
  src: string
  alt?: string
  onClose: () => void
}

export function ImagePreviewModal({ src, alt, onClose }: ImagePreviewProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={alt ?? ""}
          className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain"
        />
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-white/70 hover:text-white bg-black/50 rounded-full w-8 h-8 flex items-center justify-center transition"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
