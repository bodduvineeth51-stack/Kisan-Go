import { useTrans, LangToggle } from '../../context/LangContext'
import { PageHeader } from '../../components/ui'

// Top bar for driver screens: screen title, language, and who they drive for.
export default function DriverHeader({ me, title, chip }) {
  const { t } = useTrans()
  return (
    <div className="flex flex-col gap-0.5">
      <PageHeader title={title} chip={chip} right={<LangToggle />} />
      <p className="text-sm font-medium text-muted">
        {t('driverFor', { name: me.name, business: me.business_name ?? '' })}
      </p>
    </div>
  )
}
