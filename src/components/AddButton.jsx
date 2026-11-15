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
        className="pointer-events-auto flex h-14 items-center gap-1.5 rounded-full bg-primary pl-4 pr-5 text-base font-bold text-white shadow-fab transition-transform active:scale-95"
      >
        <Plus size={22} strokeWidth={2.6} aria-hidden="true" />
        {label ?? t('add')}
      </button>
    </div>
  )
}
