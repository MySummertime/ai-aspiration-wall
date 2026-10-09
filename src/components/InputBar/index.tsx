import { useState } from 'react';
import { Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { THEME_MAX_LENGTH } from '../../constants/theme';

interface InputBarProps {
  /** 生成中时禁用全部操作 */
  streaming: boolean;
  /** 是否已完成过至少一次生成（用于紧凑态） */
  compact: boolean;
  error: string | null;
  onSubmit: (theme: string) => void;
  onRetry: () => void;
}

/**
 * 主题输入区
 *
 * 布局策略：左上角悬浮的非对称面板，宽度约 5 栏，右侧留白
 * 需求 R2：2–60 字校验、生成期间禁用、防重复提交
 */
export function InputBar({
  streaming,
  compact,
  error,
  onSubmit,
  onRetry,
}: InputBarProps) {
  const [theme, setTheme] = useState('');
  const length = theme.trim().length;
  const tooLong = length > THEME_MAX_LENGTH;
  const canSubmit = length >= 2 && !tooLong && !streaming;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
   return;
    }
    onSubmit(theme.trim());
  };

  return (
    <section
      aria-label="主题输入"
  className={[
      // 非对称：约占 5 栏宽，右侧留白；已生成后收缩
        'relative z-20 transition-all duration-500',
    compact ? 'w-full max-w-md' : 'w-full max-w-xl',
      ].join(' ')}
    >
      <form
        onSubmit={handleSubmit}
    className="rounded-panel border border-warm-line bg-warm-subtle/95 p-5 shadow-[0_10px_28px_rgba(184,120,60,0.14)] backdrop-blur-sm"
      >
     {/*
        非对称布局：标题与字数提示分居左右两端，
        输入区与按钮不对齐，形成手工感而非标准居中
      */}
        <div className="mb-4 flex items-baseline justify-between gap-4">
     <h1
      className="font-display text-2xl font-semibold leading-tight text-ink"
        >
        {compact ? '再生成一张' : '灵感卡片墙'}
      </h1>
  <span className="shrink-0 font-mono text-xs text-ink-muted">
       {length}/{THEME_MAX_LENGTH}
      </span>
        </div>

    {!compact && (
          <p className="mb-4 max-w-sm text-sm leading-relaxed text-ink-muted">
        输入一个你正在琢磨的主题，让它变成一张可保存、可回顾的卡片。
          </p>
        )}

     <label htmlFor="theme" className="sr-only">
     主题
      </label>
        <textarea
     id="theme"
          value={theme}
  onChange={(e) => setTheme(e.target.value)}
          rows={compact ? 1 : 2}
     placeholder="比如：城市夜行"
          disabled={streaming}
          aria-invalid={tooLong}
 className={[
       'w-full resize-none rounded-card border bg-warm-base px-4 py-3',
            'font-body text-[15px] text-ink placeholder:text-ink-muted',
   'transition-colors disabled:cursor-not-allowed disabled:opacity-60',
  tooLong ? 'border-danger' : 'border-warm-line focus:border-accent',
        ].join(' ')}
      />

      <div className="mt-3 flex items-center justify-between gap-3">
        {/* 左下：错误提示；右下：主按钮 —— 刻意不对齐 */}
        <div className="min-h-5 flex-1">
          {error && (
    <p role="alert" className="text-sm text-danger">
       {error}
        </p>
          )}
          {!error && tooLong && (
      <p role="alert" className="text-sm text-danger">
    主题过长，请精简后再生成
        </p>
          )}
        </div>

        {streaming ? (
 <button
type="button"
            disabled
    className="flex shrink-0 items-center gap-2 rounded-card bg-warm-line px-5 py-2.5 font-body text-sm font-semibold text-ink-muted"
          >
            <Loader2 size={16} className="animate-spin" aria-hidden />
            生成中
       </button>
        ) : error ? (
          <button
      type="button"
    onClick={onRetry}
     className="flex shrink-0 items-center gap-2 rounded-card bg-accent px-5 py-2.5 font-body text-sm font-semibold text-warm-base transition-colors hover:bg-accent-deep focus-visible:outline-accent"
          >
            <RefreshCw size={16} aria-hidden />
            重试
      </button>
   ) : (
       <button
            type="submit"
    disabled={!canSubmit}
   className="flex shrink-0 items-center gap-2 rounded-card bg-accent px-5 py-2.5 font-body text-sm font-semibold text-warm-base transition-colors hover:bg-accent-deep disabled:cursor-not-allowed disabled:bg-warm-line disabled:text-ink-muted"
   >
            <Sparkles size={16} aria-hidden />
    生成卡片
          </button>
        )}
</div>
      </form>
    </section>
  );
}