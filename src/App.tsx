import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { InputBar } from './components/InputBar';
import { CardPreview } from './components/CardPreview';
import { CardWall } from './components/CardWall';
import { ConfirmDeleteModal } from './components/ConfirmDeleteModal';
import { useCardStream } from './hooks/useCardStream';
import { useCardWall } from './hooks/useCardWall';
import { ensureAnonymousLogin } from './services/authService';
import { saveCard, deleteCard } from './services/cardService';
import { deleteCover } from './services/storageService';
import { toNewCard } from './utils/parseCard';
import { THEME_MAX_LENGTH } from './constants/theme';
import { DEMO_MODE, seedDemoCards } from './services/demoService';
import type { Card } from './types/card';

/** 登录阶段：展示连接状态，避免用户困惑于"点了没反应" */
type AuthState = 'connecting' | 'ready' | 'failed';

export default function App() {
const [authState, setAuthState] = useState<AuthState>('connecting');
  const [authError, setAuthError] = useState<string | null>(null);

  const stream = useCardStream();
  const wall = useCardWall(authState === 'ready');

  /** 当前主题，供预览区显示与保存时写入 */
  const [theme, setTheme] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [lastSubmitted, setLastSubmitted] = useState('');
  /** 已上传的封面 fileID，保存时随卡片一起写入 */
  const [coverFileID, setCoverFileID] = useState<string | undefined>(undefined);

  /** 删除流程状态 */
  const [pendingDelete, setPendingDelete] = useState<Card | null>(null);
  const [deleting, setDeleting] = useState(false);

  const inputRef = useRef<HTMLDivElement | null>(null);

  /* 匿名登录：应用启动时执行一次 */
  useEffect(() => {
    let cancelled = false;

    ensureAnonymousLogin()
      .then(() => {
      if (!cancelled) {
     setAuthState('ready');
        }
      })
      .catch((err: unknown) => {
  if (!cancelled) {
          setAuthError(err instanceof Error ? err.message : '登录失败');
          setAuthState('failed');
        }
   });

    return () => {
      cancelled = true;
    };
  }, []);

/* 演示模式：首次进入且数据库为空时，注入示例卡片 */
  const seededRef = useRef(false);
  useEffect(() => {
    if (!DEMO_MODE || seededRef.current || authState !== 'ready') {
      return;
    }
    if (wall.cards.length > 0) {
      seededRef.current = true;
      return;
    }
  // 等首次加载完成再判断，否则会误判为空库
    if (!wall.loading && !wall.error) {
      seededRef.current = true;
      const now = new Date();
      wall.seedCards(
  seedDemoCards().map((c, i) => ({
          _id: `demo-${now.getTime()}-${i}`,
     _openid: '',
      ...c,
      createdAt: new Date(now.getTime() - i * 3600_000),
    updatedAt: now,
        })),
      );
    }
  }, [DEMO_MODE, authState, wall]);

  const handleSubmit = async (value: string) => {
    setTheme(value);
    setLastSubmitted(value);
    setSavedId(null);
    // 新一轮生成时清空上一张卡片的封面
    setCoverFileID(undefined);
    await stream.start(value);
  };

  const handleSave = async () => {
    if (stream.status !== 'done' || saving) {
      return;
    }

  setSaving(true);
    try {
      const input = toNewCard(
 stream.parsed,
        lastSubmitted || theme,
        { total_tokens: stream.totalTokens },
  coverFileID,
    );

      const id = await saveCard(input);

  // 构造本地卡片插入墙顶，避免重新请求整页。
      // createdAt 用本地时间近似，排序位置由插入顺序保证。
      const localCard: Card = {
        _id: id,
     _openid: '',
        theme: input.theme,
        title: input.title,
        quote: input.quote,
      reflection: input.reflection,
palette: input.palette,
tokenUsage: input.tokenUsage,
        createdAt: new Date(),
   updatedAt: new Date(),
      };

wall.prependCard(localCard);
      setSavedId(id);
      // 封面已随卡片入库，预览态不再持有
      setCoverFileID(undefined);
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  /**
   * 删除卡片
   *
   * 需求 R7：二次确认 → 校验归属（服务端安全规则）→ 删记录 → 清理封面
   * 需求 R7.6：封面清理失败不阻塞主流程，仅记录日志
   * 需求 R7.7：失败时卡片保持在墙上
   */
  const handleConfirmDelete = async () => {
    if (!pendingDelete || deleting) {
    return;
    }

    const target = pendingDelete;
    setDeleting(true);

    try {
      // 先删数据库记录；其中where 条件会经安全规则校验归属
      await deleteCard(target._id);

  // 记录已从数据库移除，先更新 UI，避免用户重复点击
      wall.removeCard(target._id);
      setPendingDelete(null);

      // 再清理封面文件：失败不影响已完成的主流程
      if (target.coverFileID) {
        try {
          await deleteCover(target.coverFileID);
        } catch (cleanupErr) {
          console.error(
            `[灵感卡片墙] 封面文件清理失败（卡片已删除）: ${target.coverFileID}`,
            cleanupErr,
    );
        }
      }
    } catch (err) {
  // 删除失败：卡片仍在墙上，提示原因
      const message = err instanceof Error ? err.message : '删除失败，请重试';
      setPendingDelete(null);
      alert(message);
    } finally {
      setDeleting(false);
    }
  };

  const focusInput = () => {
    inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    inputRef.current?.querySelector('textarea')?.focus();
  };

  /* 登录中：连接提示 */
  if (authState === 'connecting') {
    return (
      <div className="relative z-10 flex min-h-screen items-center justify-center px-6">
        <div className="rounded-panel border border-warm-line bg-warm-subtle px-8 py-6 text-center">
     <p className="font-display text-lg font-semibold text-ink">
  正在连接 CloudBase
 </p>
  <p className="mt-1 font-body text-sm text-ink-muted">首次进入需要完成匿名登录</p>
        </div>
      </div>
    );
  }

  /* 登录失败：明确错误与重试入口 */
  if (authState === 'failed') {
    return (
      <div className="relative z-10 flex min-h-screen items-center justify-center px-6">
        <div className="max-w-sm rounded-panel border border-danger/40 bg-warm-subtle px-8 py-6 text-center">
   <h1 className="mb-2 font-display text-lg font-semibold text-ink">
            无法连接到 CloudBase
     </h1>
    <p className="mb-1 font-body text-sm leading-relaxed text-ink-muted">
            {authError ?? '登录失败'}
       </p>
   <p className="mb-5 font-body text-xs leading-relaxed text-ink-muted">
     请确认环境已开启匿名登录，并已配置 .env 中的 envId 与 publishable key
   </p>
     <button
            type="button"
      onClick={() => window.location.reload()}
    className="rounded-card bg-accent px-5 py-2.5 font-body text-sm font-semibold text-warm-base transition-colors hover:bg-accent-deep"
          >
   重新加载
    </button>
     </div>
      </div>
    );
  }

  const streaming = stream.status === 'streaming';
  const showPreview = stream.rawText.length > 0;

  return (
    <div className="relative z-10 min-h-screen px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        {/* 演示模式横幅：非阻塞，明确告知内容来源 */}
      {DEMO_MODE && (
        <div className="relative z-10 mb-6 flex items-start gap-2 rounded-card border border-accent-soft/40 bg-warm-subtle/70 px-4 py-2.5">
          <Info size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden />
<p className="font-body text-xs leading-relaxed text-ink-muted">
      演示模式：当前环境套餐限制 Web 端调用 AI，卡片内容为预置示例。
      保存、封面上传、删除均为真实功能。
       </p>
        </div>
      )}

      {/* 输入区：左上悬浮，与下方卡片墙重叠 24px */}
        <div ref={inputRef} className="mb-[-24px] pl-2 lg:w-5/6">
          <InputBar
      streaming={streaming}
        compact={wall.cards.length > 0 || stream.status !== 'idle'}
  error={stream.error}
onSubmit={handleSubmit}
 onRetry={() => handleSubmit(lastSubmitted || theme)}
     />
    </div>

        {/* 预览区：生成中或已完成时出现 */}
        {showPreview && (
          <div className="mt-8 lg:w-5/6">
        <CardPreview
              rawText={stream.rawText}
       parsed={stream.parsed}
      streaming={streaming}
  error={stream.error}
              totalTokens={stream.totalTokens}
theme={lastSubmitted || theme}
   saving={saving}
   saved={Boolean(savedId)}
      coverFileID={coverFileID}
      onCoverUploaded={setCoverFileID}
    onCoverCleared={() => setCoverFileID(undefined)}
        onSave={handleSave}
    />
          </div>
        )}

        {/* 卡片墙 */}
        <div className={`transition-all ${showPreview ? 'mt-8' : 'mt-6'}`}>
          <CardWall
      cards={wall.cards}
            loading={wall.loading}
 hasMore={wall.hasMore}
  error={wall.error}
freshestId={savedId ?? undefined}
  onFocusInput={focusInput}
  onDelete={setPendingDelete}
        sentinelRef={wall.sentinelRef}
   />
     </div>

    {/* 页脚 */}
        <footer className="mt-10 pb-4 text-center">
      <p className="font-mono text-[11px] text-ink-muted">
            主题上限 {THEME_MAX_LENGTH} 字 · 卡片保存在你的 CloudBase 环境中
    </p>
      </footer>
      </div>

   {/* 删除二次确认弹窗 */}
      <ConfirmDeleteModal
        open={Boolean(pendingDelete)}
cardTitle={pendingDelete?.title ?? ''}
      deleting={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}