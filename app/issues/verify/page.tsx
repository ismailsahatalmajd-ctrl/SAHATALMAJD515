import VerifyIssueClient from "./verify-issue-client"
import { Suspense } from "react"

export default function VerifyIssuePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <VerifyIssueClient />
    </Suspense>
  )
}
