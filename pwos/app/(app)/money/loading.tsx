import { ListSkeleton, Skeleton } from '@/components/ui/States'

export default function Loading() {
  return (
    <div>
      <div className="px-4 pt-5 pb-3">
        <Skeleton className="h-7 w-28" />
      </div>
      <ListSkeleton rows={6} />
    </div>
  )
}
