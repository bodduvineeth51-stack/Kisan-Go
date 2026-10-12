import { Plus } from 'lucide-react'
import { useTrans } from '../context/LangContext'

// Floating "+ Add" pill (DESIGN.md → "Floating + Add button").
// Sits bottom-right, 16px above the floating BottomNav (12px gap + 68px bar).
export default function AddButton({ onClick, label, ariaLabel }) {
  const { t } = useTrans()

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-lg justify-end px-5">
      <button
        onClick={onClick}
        aria-label={ariaLabel}
        className="pointer-events-auto flex h-[58px] items-center gap-2 rounded-full bg-primary pl-4 pr-[22px] text-base font-extrabold text-white shadow-fab transition-transform active:scale-95"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-lime text-ink">
          <Plus size={18} strokeWidth={3} aria-hidden="true" />
        </span>
        {label ?? t('add')}
      </button>
    </div>
  )
}
