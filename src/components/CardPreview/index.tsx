import { useEffect, useMemo, useState } from 'react';
import { BookmarkPlus, Loader2, AlertCircle } from 'lucide-react';
import { safePalette } from '../../utils/color';
import { visibleRawText } from '../../utils/parseCard';
import { CoverUploader } from '../CoverUploader';
import { getCoverUrls } from '../../services/storageService';
import type { CardPalette, ParsedCard } from '../../types/card';

interface CardPreviewProps {
  rawText: string;
  parsed: ParsedCard;
  streaming: boolean;
  error: string | null;
  totalTokens: number;
  theme: string;
  saving: boolean;
  saved: boolean;
  /** 已上传的封面 fileID */
  coverFileID?: string;
  onCoverUploaded: (fileID: string) => void;
  onCoverCleared: () => void;
  onSave: () => void;
}

/**
 * 流式生成预览卡片
 *
 * 需求 R3：打字机光标、实时填充、token 展示
 * 背景直接使用 AI 生成的配色（经安全处理）
 */
export function CardPreview({
  rawText,
  parsed,
  streaming,
  error,
  totalTokens,
  theme,
  saving,
  saved,
  coverFileID,
  onCoverUploaded,
  onCoverCleared,
  onSave,
}: CardPreviewProps) {
  const palette: CardPalette = useMemo(
    () => safePalette(parsed.bg, parsed.fg, parsed.accent),
    [parsed.bg, parsed.fg, parsed.accent],
  );

  // 背景色变化时给一点过渡，避免生硬跳变
  const [displayBg, setDisplayBg] = useState(palette.bg);
  useEffect(() => {
    const t = setTimeout(() => setDisplayBg(palette.bg), 120);
    return () => clearTimeout(t);
  }, [palette.bg]);

  const hasContent = rawText.length > 0;

  /* 封面预览：上传完成后换取临时链接展示 */
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!coverFileID) {
      setCoverPreviewUrl(undefined);
      return;
    }
    let cancelled = false;
    void getCoverUrls([coverFileID]).then((map) => {
      if (!cancelled) {
        setCoverPreviewUrl(map[coverFileID]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [coverFileID]);

  if (!hasContent) {
    return null;
  }

  return (
    <article
      className="animate-card-in relative z-10 overflow-hidden rounded-card border border-warm-line shadow-[0_10px_28px_rgba(184,120,60,0.14)]"
      // 底色一定是浅色（见 safePalette），文字色随之落到同色系深墨；
      // 显式设置 color 让封面选择、token 等未单独配色的小字也能被继承到
      style={{ backgroundColor: displayBg, color: palette.fg }}
    >
   <div className="p-6">
        {/* 主题标签 */}
        <div className="mb-4 flex items-center gap-2">
    <span
            className="rounded-full px-3 py-1 font-mono text-xs"
        style={{
        backgroundColor: `${palette.accent}26`,
    color: palette.accent,
          }}
        >
          {theme || '未命名'}
        </span>
  {totalTokens > 0 && (
            <span
   className="font-mono text-xs opacity-60"
              style={{ color: palette.fg }}
            >
              {totalTokens} tokens
            </span>
)}
        </div>

        {/* 标题 */}
        {parsed.title && (
          <h2
      className="mb-3 font-display text-2xl font-semibold leading-snug"
    style={{ color: palette.fg }}
          >
     {parsed.title}
       </h2>
        )}

        {/* 金句 */}
        {parsed.quote && (
    <p
            className="mb-4 font-body text-[15px] leading-relaxed opacity-90"
    style={{ color: palette.fg }}
    >
       {parsed.quote}
            </p>
        )}

        {/* 延伸思考 */}
        {parsed.reflection && (
          <div
    className="rounded-card border-l-2 py-2 pl-4"
style={{
      borderColor: palette.accent,
              backgroundColor: `${palette.fg}0A`,
            }}
    >
    <p
        className="font-body text-sm leading-relaxed opacity-75"
              style={{ color: palette.fg }}
        >
       {parsed.reflection}
   </p>
          </div>
        )}

        {/* 流式原文：光标随打字推进。
            配色行属于用户不可修改的内部细节，展示时剔除（见 visibleRawText） */}
        <div className="mt-4">
        <div
            className={[
   'whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed opacity-45',
          streaming ? 'stream-caret' : '',
       ].join(' ')}
     style={{ color: palette.fg }}
     aria-live="polite"
        >
       {visibleRawText(rawText)}
    </div>
        </div>
      </div>

      {/* 封面图上传：可选，未选时卡片背景即为 AI 配色 */}
        {!streaming && !saved && (
          <CoverUploader
 fileID={coverFileID}
  previewUrl={coverPreviewUrl}
onUploaded={onCoverUploaded}
       onCleared={onCoverCleared}
       />
      )}

      {/* 底部操作区 */}
      <footer
        className="flex items-center justify-between gap-3 border-t px-6 py-3"
        style={{
     borderColor: `${palette.fg}1A`,
          backgroundColor: `${palette.fg}0A`,
     }}
      >
        <div className="min-h-5 flex-1">
     {error && (
            <p
        role="alert"
      className="flex items-center gap-1.5 text-sm"
              style={{ color: '#E24B4A' }}
       >
            <AlertCircle size={14} aria-hidden />
   {error}
     </p>
          )}
     {saved && !error && (
            <p className="text-sm" style={{ color: '#639922' }}>
    已保存到卡片墙
    </p>
          )}
{streaming && (
      <p
            className="flex items-center gap-1.5 text-sm opacity-60"
      style={{ color: palette.fg }}
     >
       <Loader2 size={14} className="animate-spin" aria-hidden />
              正在生成
 </p>
          )}
        </div>

        <button
type="button"
    onClick={onSave}
     disabled={streaming || saving || saved}
   className="flex shrink-0 items-center gap-2 rounded-card px-4 py-2 font-body text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
       style={{
       backgroundColor: palette.accent,
     color: '#FFF8F0',
          }}
        >
      {saving ? (
   <>
     <Loader2 size={15} className="animate-spin" aria-hidden />
        保存中
   </>
     ) : (
    <>
      <BookmarkPlus size={15} aria-hidden />
   {saved ? '已保存' : '保存卡片'}
    </>
          )}
      </button>
   </footer>
    </article>
  );
}