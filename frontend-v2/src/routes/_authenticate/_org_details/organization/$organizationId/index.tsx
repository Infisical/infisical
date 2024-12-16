import {
  createFileRoute,
  useRouteContext,
  useRouter,
} from '@tanstack/react-router'

function RouteComponent() {
  const user = useRouteContext({
    from: '/_authenticate',
    select: (el) => el.user,
  })
  const router = useRouter()

  return (
    <div>
      Hello {user?.email}!
      <button
        type="button"
        onClick={() => {
          router.invalidate({
            filter: (d) => {
              console.log(d)
              return true
            },
          })
        }}
      >
        Click
      </button>
    </div>
  )
}

export const Route = createFileRoute(
  '/_authenticate/_org_details/_org-layout/organization/$organizationId/',
)({
  component: RouteComponent,
})
