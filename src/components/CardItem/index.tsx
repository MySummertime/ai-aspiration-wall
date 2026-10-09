import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { safePalette } from '../../utils/color';
import type { Card } from '../../types/card';

interface CardItemProps {
  card: Card;
  /** 最新生成的卡片带轻微旋转，破除网格的机械感 */
  fresh?: boolean;
  /** 封面临时链接。未取到或已过期时为 undefined，自动回退配色背景 */
  coverUrl?: string;
  onDelete: (card: Card) => void;
}

/**
 * 卡片墙中的单张卡片
 *
 * 需求 R6.3/R6.4：封面图优先，无封面或链接失效时用 AI 配色作背景
 * 需求 R6.9：封面临时链接获取失败时回退配色，不显示破图
 * 需求 R7.1：删除入口
 */
export function CardItem({ card, fresh, coverUrl, onDelete }: CardItemProps) {
  // 二次安全处理：防止历史数据中的异常配色影响可读性
  const palette = safePalette(card.palette.bg, card.palette.fg, card.palette.accent);

  // 封面图加载失败（如临时链接过期）时降级为配色背景
  const [coverBroken, setCoverBroken] = useState(false);
  const showCover = Boolean(coverUrl) && !coverBroken;

  // 破格：最新卡片轻微旋转，历史归正
  const tilt = fresh ? ((card.title.length % 3) - 1) * 0.8 : 0;

  const dateLabel = card.createdAt
    ? card.createdAt.toLocaleDateString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
      })
    : '';

  return (
    <article
      className={[
        'animate-card-in group relative mb-4 break-inside-avoid rounded-card border border-warm-line p-5',
        fresh ? 'card-fresh' : 'card-settled',
      ].join(' ')}
      style={{
        backgroundColor: palette.bg,
        color: palette.fg,
        // @ts-expect-error CSS 自定义属性
    '--tilt': `${tilt}deg`,
      }}
    >
      {/* 删除入口：悬停时浮现，避免干扰浏览 */}
      <button
        type="button"
onClick={() => onDelete(card)}
   aria-label={`删除卡片：${card.title || '未命名'}`}
     className="absolute right-3 top-3 rounded-full p-1.5 opacity-0 transition-opacity duration-200 hover:bg-warm-base/40 focus-visible:opacity-100 group-hover:opacity-70"
        style={{ color: palette.fg }}
      >
      <Trash2 size={15} aria-hidden />
   </button>

      {/* 封面图 */}
      {showCover && (
        <div className="mb-3 overflow-hidden rounded-card">
       <img
  src={coverUrl}
         alt=""
      className="h-36 w-full object-cover"
 onError={() => setCoverBroken(true)}
    />
        </div>
      )}

      {/* 主题标签 */}
      <div className="mb-3 flex items-center justify-between gap-2 pr-7">
        <span
   className="truncate rounded-full px-2.5 py-0.5 font-mono text-[11px]"
          style={{
      backgroundColor: `${palette.accent}26`,
       color: palette.accent,
          }}
        >
{card.theme || '未命名'}
   </span>
        {dateLabel && (
     <span className="shrink-0 font-mono text-[11px] opacity-50">{dateLabel}</span>
        )}
      </div>

      <h3 className="mb-2 font-display text-lg font-semibold leading-snug">
        {card.title}
      </h3>

      {card.quote && (
        <p className="mb-3 font-body text-sm leading-relaxed opacity-85">
       {card.quote}
        </p>
      )}

    {card.reflection && (
        <p
      className="border-l-2 py-1 pl-3 font-body text-xs leading-relaxed opacity-65"
          style={{ borderColor: palette.accent }}
        >
     {card.reflection}
        </p>
      )}

  {/* 底部：仅保留 token 用量。
      配色属于用户不可修改、也不需要知道的内部细节，不再以色块形式展示 */}
  {card.tokenUsage.total_tokens > 0 && (
    <div className="mt-4 flex items-center justify-end">
      <span className="font-mono text-[10px] opacity-45">
        {card.tokenUsage.total_tokens} tokens
      </span>
    </div>
  )}
    </article>
  );
}