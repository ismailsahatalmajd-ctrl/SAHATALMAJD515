import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Package, Barcode, Tag, MapPin, MoreVertical, Edit, Eye, Trash2, TrendingDown, TrendingUp } from "lucide-react"
import type { Product } from "@/lib/types"
import { getSafeImageSrc } from "@/lib/utils"

interface MobileProductCardProps {
    product: Product
    onEdit?: (product: Product) => void
    onView?: (product: Product) => void
    onDelete?: (product: Product) => void
}

export function MobileProductCard({
    product,
    onEdit,
    onView,
    onDelete
}: MobileProductCardProps) {
    const stockStatus = product.isLowStock ? 'low' : 'normal'
    const stockColor = stockStatus === 'low' ? 'destructive' : 'default'

    return (
        <Card className="mb-3 overflow-hidden hover:shadow-md transition-shadow">
            <CardContent className="p-4">
                <div className="flex gap-3">
                    {/* Product Image */}
                    <div className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-muted border">
                        {product.image ? (
                            <img
                                src={getSafeImageSrc(product.image)}
                                alt={product.productName}
                                className="w-full h-full object-cover"
                                loading="lazy"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950 dark:to-blue-950">
                                <Package className="w-8 h-8 text-muted-foreground" />
                            </div>
                        )}
                    </div>

                    {/* Product Info */}
                    <div className="flex-1 min-w-0">
                        {/* Name + Menu */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                            <h3 className="font-bold text-base leading-tight line-clamp-2">
                                {product.productName}
                            </h3>

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 flex-shrink-0"
                                    >
                                        <MoreVertical className="w-4 h-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40">
                                    {onView && (
                                        <DropdownMenuItem onClick={() => onView(product)}>
                                            <Eye className="w-4 h-4 mr-2" />
                                            عرض التفاصيل
                                        </DropdownMenuItem>
                                    )}
                                    {onEdit && (
                                        <DropdownMenuItem onClick={() => onEdit(product)}>
                                            <Edit className="w-4 h-4 mr-2" />
                                            تعديل
                                        </DropdownMenuItem>
                                    )}
                                    {onDelete && (
                                        <DropdownMenuItem
                                            onClick={() => onDelete(product)}
                                            className="text-destructive focus:text-destructive"
                                        >
                                            <Trash2 className="w-4 h-4 mr-2" />
                                            حذف
                                        </DropdownMenuItem>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                        {/* Metadata */}
                        <div className="space-y-1.5 text-sm">
                            {/* Product Code */}
                            {product.productCode && (
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Barcode className="w-3.5 h-3.5 flex-shrink-0" />
                                    <span className="truncate">{product.productCode}</span>
                                </div>
                            )}

                            {/* Category */}
                            {product.category && (
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Tag className="w-3.5 h-3.5 flex-shrink-0" />
                                    <span className="truncate">{product.category}</span>
                                </div>
                            )}

                            {/* Location */}
                            {product.location && (
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                                    <span className="truncate">{product.location}</span>
                                </div>
                            )}
                        </div>

                        {/* Stock & Price */}
                        <div className="flex items-center justify-between mt-3 pt-3 border-t">
                            <div className="flex items-center gap-2">
                                <Badge
                                    variant={stockColor}
                                    className="font-semibold"
                                >
                                    <Package className="w-3 h-3 mr-1" />
                                    {product.currentStock || 0}
                                </Badge>

                                {stockStatus === 'low' && (
                                    <TrendingDown className="w-4 h-4 text-destructive" />
                                )}
                            </div>

                            <div className="text-lg font-bold text-primary">
                                {product.price ? `${product.price.toLocaleString('ar-SA')} ريال` : '-'}
                            </div>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
