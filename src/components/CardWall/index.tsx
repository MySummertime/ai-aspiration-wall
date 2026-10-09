import { useEffect, useMemo, useState } from 'react';
import { Loader2, Compass } from 'lucide-react';
import { CardItem } from '../CardItem';
import { getCoverUrls, type CoverUrlMap } from '../../services/storageService';
import type { Card } from '../../types/card';

interface CardWallProps {
  cards: Card[];
  loading: boolean;
  hasMore: boolean;
  error: string | null;
  /** 最新卡片 id，渲染为破格样式 */
  freshestId?: string;
  /** 空状态时把焦点交给输入框 */
  onFocusInput: () => void;
  onDelete: (card: Card) => void;
  sentinelRef: React.RefObject<HTMLDivElement>;
}

/**
 * 卡片墙瀑布流
 *
 * 布局策略：CSS columns 实现高度自适应的瀑布流，
 * 破除等高网格的机械感（设计规范 §4.5）
 */
export function CardWall({
  cards,
  loading,
  hasMore,
  error,
  freshestId,
  onFocusInput,
  onDelete,
  sentinelRef,
}: CardWallProps) {
  // 收集当前页所有封面 fileID，批量换取临时链接
  const coverIds = useMemo(
    () => cards.map((c) => c.coverFileID).filter((id): id is string => Boolean(id)),
    [cards],
  );
  const coverIdKey = coverIds.join('|');

  const [coverUrls, setCoverUrls] = useState<CoverUrlMap>({});

  useEffect(() => {
    if (coverIds.length === 0) {
      setCoverUrls({});
      return;
    }

    let cancelled = false;
    void getCoverUrls(coverIds).then((map) => {
      if (!cancelled) {
  setCoverUrls(map);
      }
    });

    return () => {
   cancelled = true;
    };
    // coverIdKey 覆盖内容变化，避免数组引用变化导致重复请求
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverIdKey]);

  // 空状态：引导用户回到输入框
  if (!loading && cards.length === 0) {
    return (
      <div className="relative z-10 rounded-card border border-dashed border-warm-line bg-warm-subtle/40 px-8 py-14 text-center">
    <Compass size={34} className="mx-auto mb-4 text-accent-soft" aria-hidden />
   <p className="mb-2 font-display text-lg font-semibold text-ink">
    卡片墙还是空的
        </p>
        <p className="mx-auto mb-6 max-w-xs font-body text-sm leading-relaxed text-ink-muted">
  输入一个主题，生成第一张灵感卡片，它会一直留在这里。
     </p>
      <button
    type="button"
  onClick={onFocusInput}
   className="rounded-card bg-accent px-5 py-2.5 font-body text-sm font-semibold text-warm-base transition-colors hover:bg-accent-deep"
   >
     去写一个主题
      </button>
      </div>
    );
  }

  return (
  <div className="relative z-10">
      {/* CSS columns 瀑布流：高度自适应，破除等高网格 */}
      <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
  {cards.map((card) => (
          <CardItem
 key={card._id}
            card={card}
      fresh={card._id === freshestId}
  coverUrl={card.coverFileID ? coverUrls[card.coverFileID] : undefined}
  onDelete={onDelete}
          />
        ))}
      </div>

      {/* 滚动哨兵：进入视口即加载下一页 */}
      <div ref={sentinelRef} aria-hidden className="h-px" />

      {/* 底部状态 */}
      <div className="mt-4 flex justify-center py-6">
        {loading && (
          <p className="flex items-center gap-2 font-body text-sm text-ink-muted">
        <Loader2 size={15} className="animate-spin" aria-hidden />
            正在加载更多卡片
     </p>
        )}
        {error && (
          <p role="alert" className="font-body text-sm text-danger">
            {error}
          </p>
        )}
    {!loading && !hasMore && cards.length > 0 && (
          <p className="font-body text-sm text-ink-muted">
            已经到底了，共 {cards.length} 张卡片
          </p>
        )}
      </div>
    </div>
  );
}