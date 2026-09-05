import { Skeleton } from '@/components/ui/States'

export default function Loading() {
  return (
    <div className="space-y-4 px-4 pt-5" aria-busy role="status" aria-label="Loading">
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-56 w-full" />
    </div>
  )
}
