import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCards } from '../services/cardService';
import type { Card } from '../types/card';

export interface CardWallState {
  cards: Card[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
}

/**
 * 卡片墙分页 Hook
 *
 * 需求 R6：按创建时间倒序、每页 20 条、滚动触底加载
 */
export function useCardWall(enabled: boolean) {
  const [state, setState] = useState<CardWallState>({
 cards: [],
    loading: false,
    error: null,
    hasMore: true,
  });

  /** 已加载的页数 */
  const pageRef = useRef(0);
  /** 防止并发加载 */
  const loadingRef = useRef(false);
  /** 卡片墙底部哨兵元素 */
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !state.hasMore) {
      return;
    }

    loadingRef.current = true;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
  const result = await fetchCards(pageRef.current);
      pageRef.current += 1;

      setState((prev) => ({
 cards: [...prev.cards, ...result.cards],
        loading: false,
        error: null,
    hasMore: result.hasMore,
   }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : '加载失败',
      }));
    } finally {
      loadingRef.current = false;
    }
  }, [state.hasMore]);

  /** 登录完成后开始首屏加载 */
  useEffect(() => {
    if (enabled && pageRef.current === 0 && !loadingRef.current) {
      void loadMore();
    }
  }, [enabled, loadMore]);

  /** 滚动触底自动加载下一页 */
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !enabled) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMore();
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled, loadMore]);

  /** 保存成功后把新卡片插到最前，避免重新请求 */
  const prependCard = useCallback((card: Card) => {
    setState((prev) => ({ ...prev, cards: [card, ...prev.cards] }));
  }, []);

  /** 批量插入示例卡片（演示模式首次进入时使用） */
  const seedCards = useCallback((seeds: Card[]) => {
    setState((prev) => ({ ...prev, cards: [...seeds, ...prev.cards] }));
  }, []);

  /** 删除后从列表移除 */
  const removeCard = useCallback((id: string) => {
    setState((prev) => ({
   ...prev,
      cards: prev.cards.filter((c) => c._id !== id),
    }));
  }, []);

  return { ...state, loadMore, prependCard, seedCards, removeCard, sentinelRef };
}