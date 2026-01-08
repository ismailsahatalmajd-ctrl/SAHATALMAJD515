import { DevicesManager } from "@/components/devices-manager"

export default function DevicesPage() {
  return (
    <div className="container py-10">
      <h1 className="text-3xl font-bold mb-6">إدارة الأجهزة</h1>
      <DevicesManager />
    </div>
  )
}
