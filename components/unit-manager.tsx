"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { getUnits, addUnit, updateUnit, deleteUnit } from "@/lib/storage"
import type { Unit } from "@/lib/types"
import { useI18n } from "@/components/language-provider"

export function UnitManager() {
  const { t } = useI18n()
  const [units, setUnits] = useState<Unit[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    abbreviation: "",
  })

  useEffect(() => {
    setUnits(getUnits())
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editingUnit) {
      const updated = updateUnit(editingUnit.id, formData)
      if (updated) {
        setUnits(units.map((u) => (u.id === updated.id ? updated : u)))
      }
    } else {
      const newUnit = addUnit(formData)
      setUnits([...units, newUnit])
    }
    resetForm()
  }

  const handleEdit = (unit: Unit) => {
    setEditingUnit(unit)
    setFormData({
      name: unit.name,
      abbreviation: unit.abbreviation,
    })
    setIsOpen(true)
  }

  const handleDelete = (id: string) => {
    if (confirm(t("unitManager.deleteConfirm"))) {
      deleteUnit(id)
      setUnits(units.filter((u) => u.id !== id))
    }
  }

  const handleSyncFromProducts = async () => {
    try {
      const { db } = await import("@/lib/db")
      const { toast } = await import("@/components/ui/use-toast")
      const { addUnit } = await import("@/lib/storage")

      // Get all products from database
      const products = await db.products.toArray()

      // Get existing units using getUnits from storage
      const existingUnits = getUnits()
      const existingUnitNames = new Set(existingUnits.map((u) => u.name.toLowerCase().trim()))

      // Extract unique units from products
      const newUnitsSet = new Set<string>()
      products.forEach((product) => {
        if (product.unit && product.unit.trim() && !existingUnitNames.has(product.unit.toLowerCase().trim())) {
          newUnitsSet.add(product.unit.trim())
        }
      })

      // Add new units using addUnit from storage (properly syncs to cache + db + cloud)
      let addedCount = 0
      for (const unitName of newUnitsSet) {
        try {
          await addUnit({
            name: unitName,
            abbreviation: unitName.substring(0, 3)
          })
          addedCount++
        } catch (error) {
          console.error(`Failed to add unit "${unitName}":`, error)
        }
      }

      // Refresh units list
      setUnits(getUnits())

      // Show success message
      const { getDualString } = await import("@/lib/i18n")
      toast({
        title: t("toast.success"),
        description: getDualString("unitManager.syncSuccess", undefined, undefined, { count: addedCount })
      })
    } catch (error) {
      console.error("Error syncing units from products:", error)
      const { toast } = await import("@/components/ui/use-toast")
      toast({
        title: t("toast.error"),
        description: String(error),
        variant: "destructive"
      })
    }
  }

  const resetForm = () => {
    setFormData({ name: "", abbreviation: "" })
    setEditingUnit(null)
    setIsOpen(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t("unitManager.title")}</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleSyncFromProducts}>
            <RefreshCw className="ml-2 h-4 w-4" />
            {t("unitManager.syncFromProducts")}
          </Button>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="ml-2 h-4 w-4" />
                {t("unitManager.addUnit")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[95vw] w-full sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingUnit ? t("unitManager.editUnit") : t("unitManager.addNewUnit")}</DialogTitle>
                <DialogDescription>{t("unitManager.enterUnitData")}</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t("unitManager.nameLabel")}</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder={t("unitManager.namePlaceholder")}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="abbreviation">{t("unitManager.abbrevLabel")}</Label>
                    <Input
                      id="abbreviation"
                      value={formData.abbreviation}
                      onChange={(e) => setFormData({ ...formData, abbreviation: e.target.value })}
                      placeholder={t("unitManager.abbrevPlaceholder")}
                      required
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={resetForm}>
                    {t("common.cancel")}
                  </Button>
                  <Button type="submit">{editingUnit ? t("common.update") : t("common.add")}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("unitManager.unitName")}</TableHead>
            <TableHead>{t("unitManager.abbrev")}</TableHead>
            <TableHead className="text-left">{t("unitManager.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {units.map((unit) => (
            <TableRow key={unit.id}>
              <TableCell className="font-medium">{unit.name}</TableCell>
              <TableCell>{unit.abbreviation}</TableCell>
              <TableCell className="text-left">
                <div className="flex gap-2 justify-end">
                  <Button size="icon" variant="ghost" onClick={() => handleEdit(unit)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(unit.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
