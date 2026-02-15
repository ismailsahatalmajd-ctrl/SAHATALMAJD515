import { Package, Zap, DollarSign, Box, BarChart2, Star } from "lucide-react"

export type TableViewMode = 'default' | 'quick' | 'financial' | 'inventory' | 'all' | 'analytics'

export interface TableViewConfig {
    id: TableViewMode
    label: string
    labelAr: string
    icon: any
    columns: string[]
}

export const TABLE_VIEW_MODES: TableViewConfig[] = [
    {
        id: 'default',
        label: 'Standard View',
        labelAr: 'العرض القياسي',
        icon: Star,
        columns: ['image', 'productCode', 'productName', 'category', 'currentStock', 'price', 'averagePrice', 'location', 'unit', 'lastActivity', 'actions']
    },
    {
        id: 'quick',
        label: 'Quick View',
        labelAr: 'عرض سريع',
        icon: Zap,
        columns: ['image', 'productCode', 'productName', 'currentStock', 'price', 'location', 'actions']
    },
    {
        id: 'financial',
        label: 'Financial View',
        labelAr: 'عرض مالي',
        icon: DollarSign,
        columns: ['productName', 'currentStock', 'price', 'averagePrice', 'currentStockValue', 'purchasesValue', 'issuesValue', 'returnsValue', 'actions']
    },
    {
        id: 'inventory',
        label: 'Inventory Tracking',
        labelAr: 'تتبع المخزون',
        icon: Box,
        columns: ['image', 'productName', 'openingStock', 'purchases', 'returns', 'issues', 'currentStock', 'status', 'actions']
    },
    {
        id: 'analytics',
        label: 'Analytics',
        labelAr: 'تحليل الأداء',
        icon: BarChart2,
        columns: ['productName', 'category', 'turnoverRate', 'lastActivity', 'status', 'difference', 'actions']
    },
    {
        id: 'all',
        label: 'Detailed View (All)',
        labelAr: 'عرض تفصيلي (الكل)',
        icon: Package,
        columns: [
            'image', 'productCode', 'itemNumber', 'productName', 'category', 'location',
            'unit', 'quantityPerCarton', 'cartonDimensions',
            'openingStock', 'purchases', 'returns', 'issues',
            'inventoryCount', 'currentStock', 'difference',
            'price', 'averagePrice', 'currentStockValue', 'issuesValue', 'turnoverRate',
            'lastActivity', 'status', 'actions'
        ]
    }
]

// --- Helper Functions ---

export function getColumnsForView(mode: TableViewMode): string[] {
    const config = TABLE_VIEW_MODES.find(m => m.id === mode)
    return config ? config.columns : TABLE_VIEW_MODES[0].columns
}

export function calculateTurnoverRate(product: any): number {
    const issues = Number(product.issues || 0)
    const averageInventory = (Number(product.openingStock || 0) + Number(product.currentStock || 0)) / 2
    if (averageInventory === 0) return 0
    return issues / averageInventory
}

export function getStockStatus(product: any): 'in-stock' | 'low-stock' | 'out-of-stock' {
    const current = Number(product.currentStock || 0)
    const min = Number(product.minStockLevel || 0) // Assuming minStockLevel exists on product, otherwise 0

    if (current <= 0) return 'out-of-stock'
    if (current <= min) return 'low-stock'
    return 'in-stock'
}
