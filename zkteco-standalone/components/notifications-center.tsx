"use client"

import { useState, useEffect } from "react"
import { Bell, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { db } from "@/lib/db"
import { useI18n } from "@/components/language-provider"
import { DualText } from "@/components/ui/dual-text"

type Notification = {
  id: string
  type: "warning" | "info" | "success" | "error"
  title: string
  message: string
  date: Date
  read: boolean
}

export function NotificationsCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const { lang } = useI18n()

  useEffect(() => {
    const load = async () => {
      try {
        // Migration logic
        const count = await db.notifications.count()
        if (count === 0) {
          const raw = localStorage.getItem("notifications")
          if (raw) {
            const parsed = JSON.parse(raw)
            const toAdd = parsed.map((n: any) => ({
              id: n.id,
              type: n.type,
              title: n.title,
              message: n.message,
              date: n.date, // assuming ISO string
              read: n.read ? 1 : 0
            }))
            await db.notifications.bulkAdd(toAdd)
            localStorage.removeItem("notifications")
          }
        }

        const list = await db.notifications.orderBy('date').reverse().toArray()
        setNotifications(list.map(n => ({
          ...n,
          read: !!n.read,
          date: new Date(n.date)
        })))
      } catch (e) {
        console.error("Failed to load notifications", e)
      }
    }

    if (open) {
      load()
    } else {
      // Initial load for badge count
      load()
    }
  }, [open])

  const unreadCount = notifications.filter((n) => !n.read).length

  const markAsRead = async (id: string) => {
    try {
      await db.notifications.update(id, { read: 1 })
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    } catch { }
  }

  const markAllAsRead = async () => {
    try {
      const unread = notifications.filter(n => !n.read)
      await Promise.all(unread.map(n => db.notifications.update(n.id, { read: 1 })))
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    } catch { }
  }

  const deleteNotification = async (id: string) => {
    try {
      await db.notifications.delete(id)
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    } catch { }
  }

  const getNotificationColor = (type: string) => {
    switch (type) {
      case "warning":
        return "bg-yellow-100 text-yellow-800 border-yellow-300"
      case "error":
        return "bg-red-100 text-red-800 border-red-300"
      case "success":
        return "bg-green-100 text-green-800 border-green-300"
      default:
        return "bg-blue-100 text-blue-800 border-blue-300"
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96" align="end">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold"><DualText k="notifications.title" /></h3>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllAsRead}>
                <DualText k="notifications.markAllRead" />
              </Button>
            )}
          </div>

          <ScrollArea className="h-96">
            {notifications.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground"><DualText k="notifications.empty" /></div>
            ) : (
              <div className="space-y-2">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-3 rounded-lg border ${!notification.read ? getNotificationColor(notification.type) : "bg-muted"
                      }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 space-y-1">
                        <p className="font-medium text-sm">{notification.title}</p>
                        <p className="text-sm opacity-90">{notification.message}</p>
                        <p className="text-xs opacity-75">{notification.date.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}</p>
                      </div>
                      <div className="flex gap-1">
                        {!notification.read && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => markAsRead(notification.id)}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => deleteNotification(notification.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  )
}
