import { useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, X } from 'lucide-react';
import { uploadCover } from '../../services/storageService';

interface CoverUploaderProps {
  /** 已上传的封面 fileID */
  fileID?: string;
  /** 已上传封面临时链接 */
  previewUrl?: string;
  onUploaded: (fileID: string) => void;
  onCleared: () => void;
}

/**
 * 封面图选择与上传
 *
 * 需求 R5：可选；类型与大小校验；上传进度；未选时用 AI 配色占位
 */
export function CoverUploader({
  fileID,
  previewUrl,
  onUploaded,
  onCleared,
}: CoverUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];

    setError(null);

    if (!file) {
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      const result = await uploadCover(file, setProgress);
      onUploaded(result.fileID);
    } catch (err) {
      setError(err instanceof Error ? err.message : '图片上传失败');
      // 清空选择，允许重新选择同一文件
      input.value = '';
    } finally {
      setUploading(false);
    }
  };

  const handleClear = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setError(null);
    setProgress(0);
    onCleared();
  };

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-xs opacity-70">封面图（可选）</span>
        {uploading && (
          <span className="font-mono text-xs opacity-60">{progress}%</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* 已上传封面：显示预览缩略图 */}
        {fileID && previewUrl && (
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-card border border-warm-line">
    <img src={previewUrl} alt="封面预览" className="h-full w-full object-cover" />
          </div>
        )}

        {/* 上传中进度条 */}
        {uploading && (
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-warm-line/40">
<div
   className="h-full rounded-full transition-all duration-200"
    style={{ width: `${progress}%`, backgroundColor: '#E8613C' }}
            />
          </div>
        )}

        {/* 触发选择的隐藏 input */}
        <input
   ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleSelect}
          disabled={uploading}
        />

      {!uploading && (
    <button
      type="button"
    onClick={() => fileInputRef.current?.click()}
      className="flex items-center gap-1.5 rounded-card border border-warm-line px-3 py-1.5 font-body text-xs transition-colors hover:border-accent"
      >
    <ImageIcon size={14} aria-hidden />
  {fileID ? '换一张' : '选择图片'}
      </button>
        )}

        {/* 已上传后可移除 */}
        {fileID && !uploading && (
     <button
   type="button"
onClick={handleClear}
            className="flex items-center gap-1 rounded-card px-2 py-1.5 font-body text-xs opacity-70 transition-opacity hover:opacity-100"
      aria-label="移除封面"
   >
            <X size={14} aria-hidden />
  移除
    </button>
        )}
      </div>

      {error && (
     <p role="alert" className="mt-2 font-body text-xs" style={{ color: '#E24B4A' }}>
          {error}
   </p>
      )}

  {uploading && (
        <p className="mt-2 flex items-center gap-1.5 font-mono text-xs opacity-60">
<Loader2 size={12} className="animate-spin" aria-hidden />
   正在上传
        </p>
      )}
    </div>
  );
}