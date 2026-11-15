import { PageHeader } from '../../components/ui'

// Top bar for driver list screens. Language and "driver for" live on the
// driver Home and Profile screens only, so list screens stay uncluttered.
export default function DriverHeader({ title, chip }) {
  return <PageHeader title={title} chip={chip} />
}
