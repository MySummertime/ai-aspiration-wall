import { AlertTriangle } from 'lucide-react';

interface ConfirmDeleteModalProps {
  open: boolean;
  cardTitle: string;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 删除二次确认弹窗
 *
 * 需求 R7.2：明确告知该操作不可撤销
 */
export function ConfirmDeleteModal({
  open,
  cardTitle,
  deleting,
  onConfirm,
  onCancel,
}: ConfirmDeleteModalProps) {
  if (!open) {
    return null;
  }

  return (
 <div
    className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
    >
      {/* 遮罩 */}
      <div
    className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]"
        onClick={deleting ? undefined : onCancel}
        aria-hidden
      />

    <div className="animate-card-in relative w-full max-w-sm rounded-panel border border-warm-line bg-warm-base p-6 shadow-[0_18px_44px_rgba(60,40,20,0.22)]">
        <div className="mb-4 flex items-start gap-3">
          <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: '#FCEBEB' }}
    >
      <AlertTriangle size={19} aria-hidden style={{ color: '#E24B4A' }} />
    </span>
  <div className="min-w-0">
       <h2
        id="delete-modal-title"
              className="mb-1 font-display text-lg font-semibold text-ink"
       >
    删除这张卡片？
      </h2>
 <p className="font-body text-sm leading-relaxed text-ink-muted">
      「{cardTitle || '未命名'}」将被永久移除，封面图也会一并删除。
   </p>
        </div>
      </div>

        <div className="mt-6 flex justify-end gap-2">
     <button
    type="button"
  onClick={onCancel}
       disabled={deleting}
      className="rounded-card border border-warm-line px-4 py-2 font-body text-sm transition-colors hover:border-ink-muted disabled:opacity-50"
     >
       取消
    </button>
          <button
     type="button"
            onClick={onConfirm}
       disabled={deleting}
            className="rounded-card px-4 py-2 font-body text-sm font-semibold text-warm-base transition-colors disabled:opacity-60"
     style={{ backgroundColor: '#E24B4A' }}
       >
      {deleting ? '删除中…' : '确认删除'}
          </button>
        </div>
      </div>
    </div>
  );
}