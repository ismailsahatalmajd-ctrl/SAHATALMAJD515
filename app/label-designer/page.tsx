"use client"

import { useState, useEffect, useMemo } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Printer, Layout, Tag, Type, Barcode, ArrowLeft, ChevronUp, ChevronDown, Layers, Plus, Trash2 } from "lucide-react"
import JsBarcode from "jsbarcode"
import QRCode from "qrcode"
import { db } from "@/lib/db"
import { getProducts, getLabelTemplates, addLabelTemplate, deleteLabelTemplate, subscribe as subscribeStore } from "@/lib/storage"
import { getSafeImageSrc } from "@/lib/utils"
import type { Product, LabelTemplate, LabelTemplateElement } from "@/lib/types"

export default function LabelDesignerPage() {
    const searchParams = useSearchParams()
    const router = useRouter()
    
    // Check if this is bulk printing
    const isBulkPrinting = searchParams.get('bulk') === 'true'
    const allProducts = useMemo(() => getProducts(), [])
    const [productSearchTerm, setProductSearchTerm] = useState("")
    const [searchResults, setSearchResults] = useState<Product[]>([])
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
    const [selectedBatchProducts, setSelectedBatchProducts] = useState<Product[]>([])
    const productCount = parseInt(searchParams.get('count') || '1')
    
    // Parse multiple products for bulk printing
    const bulkProducts = useMemo(() => {
        if (!isBulkPrinting) return []
        
        const products = []
        for (let i = 0; i < productCount; i++) {
            products.push({
                id: searchParams.get(`product_${i}_id`) || '',
                productCode: searchParams.get(`product_${i}_productCode`) || '',
                itemNumber: searchParams.get(`product_${i}_itemNumber`) || '',
                productName: searchParams.get(`product_${i}_productName`) || '',
                barcode: searchParams.get(`product_${i}_barcode`) || '',
                price: searchParams.get(`product_${i}_price`) || '0'
            })
        }
        return products
    }, [isBulkPrinting, productCount, searchParams])
    
    // Label Settings
    const [width, setWidth] = useState(60) // mm
    const [height, setHeight] = useState(40) // mm

    // New Dynamic Element System
    type ElementType = LabelTemplateElement["type"]
    type LabelElement = LabelTemplateElement

    const BOUND_FIELD_IDS = ["title", "nameAr", "nameEn", "barcode", "internalCode", "price"] as const
    type BoundFieldId = (typeof BOUND_FIELD_IDS)[number]
    const isBoundFieldId = (id: string): id is BoundFieldId =>
        (BOUND_FIELD_IDS as readonly string[]).includes(id)

    const hasProductData = Boolean(searchParams.get("productName")) || isBulkPrinting
    
    const [elements, setElements] = useState<LabelElement[]>([
        {
            id: 'title',
            type: 'text',
            x: 5,
            y: 2,
            width: 50,
            height: 4,
            content: "بطاقة المنتج",
            fontSize: 9,
            fontWeight: 'normal',
            isVisible: !hasProductData,
            textAlign: 'center',
            rotation: 0,
        },
        {
            id: 'nameAr',
            type: 'text',
            x: 5,
            y: 8,
            width: 50,
            height: 9,
            content: searchParams.get('productName') || "علبة ميكس براند بني (تجربة)",
            fontSize: 12,
            fontWeight: 'bold',
            isVisible: true,
            textAlign: 'center',
            rotation: 0,
        },
        {
            id: 'nameEn',
            type: 'text',
            x: 5,
            y: 17,
            width: 50,
            height: 5,
            content:
                searchParams.get('productName') ||
                "Mix Brand Box Brown (Demo)",
            fontSize: 9,
            fontWeight: 'normal',
            isVisible: true,
            textAlign: 'center',
            rotation: 0,
        },
        {
            id: 'barcode',
            type: 'barcode',
            x: 10,
            y: 22,
            width: 40,
            height: 12,
            content: searchParams.get('barcode') || searchParams.get('productCode') || "6281057012517",
            fontSize: 8,
            fontWeight: 'normal',
            isVisible: true,
            textAlign: 'center',
            rotation: 0,
            barcodeLineWidth: 2,
            barcodeWidthPercent: 100,
        },
        {
            id: 'internalCode',
            type: 'internalCode',
            x: 5,
            y: 34,
            width: 50,
            height: 5,
            content: searchParams.get('itemNumber') || searchParams.get('productCode') || "BOX-MIXB-BRN-25-0001",
            fontSize: 9,
            fontWeight: 'bold',
            isVisible: true,
            textAlign: 'center',
            rotation: 0,
        },
        {
            id: 'qrcode',
            type: 'qrcode',
            x: 50,
            y: 2,
            width: 8,
            height: 8,
            content: "",
            fontSize: 8,
            fontWeight: 'normal',
            isVisible: true,
            textAlign: 'center',
            rotation: 0,
        },
        {
            id: 'price',
            type: 'price',
            x: 40,
            y: 30,
            width: 15,
            height: 6,
            content: searchParams.get('price') || "0.00",
            fontSize: 10,
            fontWeight: 'bold',
            isVisible: hasProductData,
            textAlign: 'center',
            rotation: 0,
        },
        {
            id: 'productImage',
            type: 'image',
            x: 1.2,
            y: 1.2,
            width: 14,
            height: 14,
            content: "",
            fontSize: 8,
            fontWeight: 'normal',
            isVisible: false,
            textAlign: 'center',
            rotation: 0,
        }
    ])
    const [savedTemplates, setSavedTemplates] = useState<LabelTemplate[]>([])
    const [selectedTemplateId, setSelectedTemplateId] = useState("")
    const [newTemplateName, setNewTemplateName] = useState("")
    const [isSavingTemplate, setIsSavingTemplate] = useState(false)

    const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
    const [draggingId, setDraggingId] = useState<string | null>(null)
    const [resizingId, setResizingId] = useState<string | null>(null)
    const [rotatingId, setRotatingId] = useState<string | null>(null)
    const [resizeHandle, setResizeHandle] = useState<string | null>(null)
    const [dragStart, setDragStart] = useState({ x: 0, y: 0, elementX: 0, elementY: 0, elementW: 0, elementH: 0, startRotation: 0 })
    
    // Designer Options
    const [showGrid, setShowGrid] = useState(false)
    const [showRuler, setShowRuler] = useState(true)
    const [gridStrength, setGridStrength] = useState<"light" | "strong">("light")
    const [showProductImage, setShowProductImage] = useState(false)
    const [resolvedPreviewImage, setResolvedPreviewImage] = useState("")
    const [gridSize, setGridSize] = useState(5) // mm
    const [qrBaseUrl, setQrBaseUrl] = useState(() => {
        const fromEnv = process.env.NEXT_PUBLIC_QR_BASE_URL || ""
        if (fromEnv) return fromEnv.replace(/\/+$/, "")
        return "https://sahatcom.cards"
    })

    // Default elements with initial rotation
    useEffect(() => {
        setElements(prev => prev.map(el => ({ ...el, rotation: el.rotation ?? 0 })))
    }, [])

    useEffect(() => {
        if (!qrBaseUrl) {
            setQrBaseUrl("https://sahatcom.cards")
        }
    }, [qrBaseUrl])

    useEffect(() => {
        const refreshTemplates = () => {
            setSavedTemplates(getLabelTemplates())
        }
        refreshTemplates()
        const unsubscribe = subscribeStore("label_templates_change", refreshTemplates)
        return () => unsubscribe()
    }, [])

    useEffect(() => {
        const term = productSearchTerm.trim().toLowerCase()
        if (!term) {
            setSearchResults([])
            return
        }

        const results = allProducts.filter((product) => {
            const name = String(product.productName || "").toLowerCase()
            const code = String(product.productCode || "").toLowerCase()
            const item = String(product.itemNumber || "").toLowerCase()
            return name.includes(term) || code.includes(term) || item.includes(term)
        }).slice(0, 8)

        setSearchResults(results)
    }, [productSearchTerm, allProducts])

    const handleSelectProduct = (product: Product) => {
        setSelectedProduct(product)
        setProductSearchTerm(product.productName || product.productCode || "")
        setSearchResults([])
        
        // Update elements with selected product data
        setElements(prev => prev.map(el => {
            if (el.id === 'nameAr') return { ...el, content: product.productName || "" }
            if (el.id === 'nameEn') return { ...el, content: product.productName || "" }
            if (el.id === 'barcode') return { ...el, content: product.productCode || "" }
            if (el.id === 'qrcode') return { ...el, content: buildProductViewerUrl(product.productCode || product.itemNumber || "") }
            if (el.id === 'internalCode') return { ...el, content: product.itemNumber || product.productCode || "" }
            if (el.id === 'price') return { ...el, content: String(product.price ?? 0) }
            return el
        }))
    }

    const addProductToBatch = (product: Product) => {
        setSelectedBatchProducts((prev) => {
            if (prev.some((p) => p.id === product.id)) return prev
            return [...prev, product]
        })
    }

    const removeProductFromBatch = (productId: string) => {
        setSelectedBatchProducts((prev) => prev.filter((p) => p.id !== productId))
    }

    const clearBatchProducts = () => {
        setSelectedBatchProducts([])
    }

    const previewData = {
        internalCode: selectedProduct?.itemNumber || searchParams.get('itemNumber') || searchParams.get('productCode') || "BOX-MIXB-BRN-25-0001",
        barcode: selectedProduct?.productCode || searchParams.get('barcode') || searchParams.get('productCode') || "6281057012517",
        fullNameArabic: selectedProduct?.productName || searchParams.get('productName') || "علبة ميكس براند بني (تجربة)",
        fullNameEnglish: selectedProduct?.productName || searchParams.get('productName') || "Mix Brand Box Brown (Demo)",
        titleArabic: "بطاقة المنتج",
        productImage: resolvedPreviewImage
    }

    const currentProductFromParams = useMemo(() => {
        if (selectedProduct) return selectedProduct

        const code = searchParams.get("productCode") || searchParams.get("barcode") || ""
        const itemNumber = searchParams.get("itemNumber") || ""
        const productName = searchParams.get("productName") || ""

        return (
            allProducts.find(
                (product) =>
                    (code && (product.productCode === code || product.itemNumber === code)) ||
                    (itemNumber && (product.itemNumber === itemNumber || product.productCode === itemNumber)) ||
                    (productName && product.productName === productName),
            ) || null
        )
    }, [selectedProduct, searchParams, allProducts])

    const bi = (ar: string, en: string) => `${ar} / ${en}`

    const buildProductViewerUrl = (code?: string) => {
        const cleanCode = String(code || "").trim()
        if (!cleanCode) return ""
        const cleanBase = String(qrBaseUrl || "").trim().replace(/\/+$/, "")
        const path = `/product-viewer?code=${encodeURIComponent(cleanCode)}`
        return cleanBase ? `${cleanBase}${path}` : path
    }

    const stripProductValuesForTemplate = (items: LabelElement[]) =>
        items.map((el) => {
            if (el.id === "nameAr" || el.id === "nameEn") return { ...el, content: "" }
            if (el.id === "barcode") return { ...el, content: "" }
            if (el.id === "qrcode") return { ...el, content: "" }
            if (el.id === "internalCode") return { ...el, content: "" }
            if (el.id === "price") return { ...el, content: "" }
            if (el.id === "productImage") return { ...el, content: "" }
            return { ...el }
        })

    const handleApplyTemplate = (templateId: string) => {
        if (!templateId) return
        const template = savedTemplates.find((t) => t.id === templateId)
        if (!template) return

        const activeProduct = selectedProduct || currentProductFromParams
        const activeName = activeProduct?.productName || searchParams.get("productName") || ""
        const activeBarcode =
            activeProduct?.productCode ||
            searchParams.get("barcode") ||
            searchParams.get("productCode") ||
            ""
        const activeItemNumber =
            activeProduct?.itemNumber ||
            searchParams.get("itemNumber") ||
            searchParams.get("productCode") ||
            ""
        const activePrice = String(activeProduct?.price ?? searchParams.get("price") ?? "0.00")

        const hydrated = template.elements.map((el) => {
            if (el.id === "nameAr") return { ...el, content: activeName || el.content }
            if (el.id === "nameEn") return { ...el, content: activeName || el.content }
            if (el.id === "barcode") return { ...el, content: activeBarcode || el.content }
            if (el.id === "qrcode") {
                const nextQr = buildProductViewerUrl(activeBarcode || activeItemNumber)
                return { ...el, content: nextQr || el.content }
            }
            if (el.id === "internalCode") return { ...el, content: activeItemNumber || el.content }
            if (el.id === "price") return { ...el, content: activePrice || el.content }
            if (el.id === "productImage") return { ...el, content: resolvedPreviewImage || "" }
            return { ...el }
        })

        setWidth(template.width)
        setHeight(template.height)
        setElements(hydrated)
        setSelectedTemplateId(template.id)
        setSelectedElementId(null)
    }

    const handleSaveTemplate = async () => {
        const templateName = newTemplateName.trim()
        if (!templateName) {
            window.alert(bi("اكتب اسم القالب أولاً", "Please enter a template name first"))
            return
        }

        setIsSavingTemplate(true)
        try {
            const saved = await addLabelTemplate({
                name: templateName,
                width,
                height,
                // Save structure/style only for product-bound fields; values are injected at apply time.
                elements: stripProductValuesForTemplate(elements),
            })
            setSelectedTemplateId(saved.id)
            setNewTemplateName("")
        } catch (error) {
            console.error("Failed to save label template", error)
            window.alert(bi("فشل حفظ القالب", "Failed to save template"))
        } finally {
            setIsSavingTemplate(false)
        }
    }

    const handleDeleteTemplate = async () => {
        if (!selectedTemplateId) return
        const target = savedTemplates.find((t) => t.id === selectedTemplateId)
        if (!target) return

        const confirmed = window.confirm(
            bi(`هل تريد حذف القالب: ${target.name}؟`, `Delete template: ${target.name}?`),
        )
        if (!confirmed) return

        try {
            await deleteLabelTemplate(target.id)
            setSelectedTemplateId("")
        } catch (error) {
            console.error("Failed to delete label template", error)
            window.alert(bi("فشل حذف القالب", "Failed to delete template"))
        }
    }

    // Converters
    const pxPerMm = 3.78
    const mmToPx = (mm: number) => mm * pxPerMm
    const pxToMm = (px: number) => px / pxPerMm
    const getFontScale = () => {
        const wScale = width / 60
        const hScale = height / 40
        return Math.max(0.8, Math.min(1.35, Math.min(wScale, hScale)))
    }
    const getScaledFontSize = (baseSize: number) => {
        const scaled = baseSize * getFontScale()
        return Math.max(6, Math.min(42, Math.round(scaled * 10) / 10))
    }

    const resolveProductImage = async (productId?: string, image?: string) => {
        if (!image) return ""
        if (image === "DB_IMAGE") {
            if (!productId) return ""
            try {
                const rec = await db.productImages.get(productId)
                return rec?.data ? getSafeImageSrc(rec.data) : ""
            } catch {
                return ""
            }
        }
        return getSafeImageSrc(image)
    }

    useEffect(() => {
        let cancelled = false

        const loadPreviewImage = async () => {
            const productId = currentProductFromParams?.id || searchParams.get("id") || undefined
            const image =
                currentProductFromParams?.image ||
                searchParams.get("productImage") ||
                undefined
            const src = await resolveProductImage(productId, image)
            if (!cancelled) setResolvedPreviewImage(src)
        }

        loadPreviewImage()
        return () => {
            cancelled = true
        }
    }, [currentProductFromParams, searchParams])

    useEffect(() => {
        setElements((prev) =>
            prev.map((el) =>
                el.id === "productImage"
                    ? { ...el, content: resolvedPreviewImage }
                    : el,
            ),
        )
    }, [resolvedPreviewImage])

    useEffect(() => {
        const code =
            selectedProduct?.productCode ||
            currentProductFromParams?.productCode ||
            searchParams.get("productCode") ||
            searchParams.get("barcode") ||
            ""

        const qrContent = buildProductViewerUrl(code)
        if (!qrContent) return

        setElements((prev) =>
            prev.map((el) =>
                el.id === "qrcode" ? { ...el, content: qrContent } : el,
            ),
        )
    }, [selectedProduct, currentProductFromParams, searchParams, qrBaseUrl])

    const handleMouseDown = (e: React.MouseEvent, element: LabelElement, type: 'drag' | 'resize' | 'rotate' = 'drag', handle?: string) => {
        e.stopPropagation()
        setSelectedElementId(element.id)
        
        const rect = e.currentTarget.getBoundingClientRect()
        
        if (type === 'drag') {
            setDraggingId(element.id)
            setDragStart({ 
                x: e.clientX, 
                y: e.clientY, 
                elementX: element.x, 
                elementY: element.y,
                elementW: element.width,
                elementH: element.height,
                startRotation: element.rotation || 0
            })
        } else if (type === 'resize' && handle) {
            setResizingId(element.id)
            setResizeHandle(handle)
            setDragStart({ 
                x: e.clientX, 
                y: e.clientY, 
                elementX: element.x, 
                elementY: element.y,
                elementW: element.width,
                elementH: element.height,
                startRotation: element.rotation || 0
            })
        } else if (type === 'rotate') {
            setRotatingId(element.id)
            setDragStart({
                x: e.clientX,
                y: e.clientY,
                elementX: element.x,
                elementY: element.y,
                elementW: element.width,
                elementH: element.height,
                startRotation: element.rotation || 0
            })
        }
    }

    const snapMm = (v: number) => {
        if (!showGrid || gridSize <= 0) return v
        const g = gridSize
        return Math.round(v / g) * g
    }

    const handleMouseMove = (e: MouseEvent) => {
        if (draggingId) {
            const dx = pxToMm(e.clientX - dragStart.x)
            const dy = pxToMm(e.clientY - dragStart.y)
            
            setElements(prev => prev.map(el => {
                if (el.id === draggingId) {
                    let nx = Math.max(0, Math.min(width - el.width, dragStart.elementX + dx))
                    let ny = Math.max(0, Math.min(height - el.height, dragStart.elementY + dy))
                    if (showGrid) {
                        nx = snapMm(nx)
                        ny = snapMm(ny)
                        nx = Math.max(0, Math.min(width - el.width, nx))
                        ny = Math.max(0, Math.min(height - el.height, ny))
                    }
                    return {
                        ...el,
                        x: nx,
                        y: ny,
                    }
                }
                return el
            }))
        } else if (resizingId && resizeHandle) {
            const dx = pxToMm(e.clientX - dragStart.x)
            const dy = pxToMm(e.clientY - dragStart.y)
            
            setElements(prev => prev.map(el => {
                if (el.id === resizingId) {
                    let newX = el.x, newY = el.y, newW = el.width, newH = el.height
                    
                    if (resizeHandle.includes('e')) newW = Math.max(2, dragStart.elementW + dx)
                    if (resizeHandle.includes('s')) newH = Math.max(2, dragStart.elementH + dy)
                    if (resizeHandle.includes('w')) {
                        const actualDx = Math.min(dragStart.elementW - 2, dx)
                        newX = dragStart.elementX + actualDx
                        newW = dragStart.elementW - actualDx
                    }
                    if (resizeHandle.includes('n')) {
                        const actualDy = Math.min(dragStart.elementH - 2, dy)
                        newY = dragStart.elementY + actualDy
                        newH = dragStart.elementH - actualDy
                    }
                    
                    return { ...el, x: newX, y: newY, width: newW, height: newH }
                }
                return el
            }))
        } else if (rotatingId) {
            const el = elements.find(e => e.id === rotatingId)
            if (!el) return

            const canvasRect = document.querySelector('.label-canvas-container')?.getBoundingClientRect()
            if (!canvasRect) return

            const centerX = canvasRect.left + mmToPx(el.x + el.width / 2)
            const centerY = canvasRect.top + mmToPx(el.y + el.height / 2)
            
            const dx = e.clientX - centerX
            const dy = e.clientY - centerY
            
            let angle = Math.atan2(dy, dx) * (180 / Math.PI)
            angle = (angle + 90) % 360 // Adjust so 0 is up
            if (angle < 0) angle += 360
            
            // Snap to 45 degrees
            if (!e.shiftKey) {
                angle = Math.round(angle / 45) * 45
            }

            setElements(prev => prev.map(item => item.id === rotatingId ? { ...item, rotation: angle } : item))
        }
    }

    const handleMouseUp = () => {
        setDraggingId(null)
        setResizingId(null)
        setRotatingId(null)
        setResizeHandle(null)
    }

    useEffect(() => {
        if (draggingId || resizingId || rotatingId) {
            window.addEventListener('mousemove', handleMouseMove)
            window.addEventListener('mouseup', handleMouseUp)
        } else {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
        }
    }, [draggingId, resizingId, rotatingId, elements, showGrid, gridSize, width, height])

    useEffect(() => {
        if (!selectedElementId || draggingId || resizingId || rotatingId) return
        const step = showGrid ? gridSize : 1
        const snapVal = (v: number) => {
            if (!showGrid || gridSize <= 0) return v
            return Math.round(v / gridSize) * gridSize
        }
        const onKey = (ev: KeyboardEvent) => {
            const t = ev.target as HTMLElement | null
            if (t?.closest?.("input, textarea, select, [contenteditable=true]")) return
            if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(ev.key)) return
            ev.preventDefault()
            setElements((prev) =>
                prev.map((el) => {
                    if (el.id !== selectedElementId) return el
                    let nx = el.x
                    let ny = el.y
                    if (ev.key === "ArrowLeft") nx -= step
                    if (ev.key === "ArrowRight") nx += step
                    if (ev.key === "ArrowUp") ny -= step
                    if (ev.key === "ArrowDown") ny += step
                    if (showGrid) {
                        nx = snapVal(nx)
                        ny = snapVal(ny)
                    }
                    return {
                        ...el,
                        x: Math.max(0, Math.min(width - el.width, nx)),
                        y: Math.max(0, Math.min(height - el.height, ny)),
                    }
                }),
            )
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [selectedElementId, draggingId, resizingId, rotatingId, width, height, showGrid, gridSize])

    const isSmallLabel = width < 50 || height < 30
    
    // JSBarcode and QRCode effect for the current elements
    useEffect(() => {
        // Render barcodes
        elements.filter(el => el.type === 'barcode' && el.isVisible).forEach(el => {
            const svg = document.getElementById(`preview-barcode-${el.id}`)
            if (svg) {
                try {
                    JsBarcode(svg, el.content, {
                        format: "CODE128",
                        width: el.barcodeLineWidth ?? 2,
                        height: Math.max(20, mmToPx(el.height) - 10),
                        margin: 0,
                        displayValue: false,
                    })
                } catch (e) {}
            }
        })
        
        // Render QR codes
        elements.filter(el => el.type === 'qrcode' && el.isVisible).forEach(el => {
            const canvas = document.getElementById(`preview-qrcode-${el.id}`) as HTMLCanvasElement
            if (canvas && el.content) {
                try {
                    const qrOptions: any = {
                        errorCorrectionLevel: 'H',
                        margin: 0,
                        width: Math.round(mmToPx(el.width)),
                    }
                    QRCode.toCanvas(canvas, el.content, qrOptions)
                } catch (e) {}
            }
        })
    }, [elements, width, height])

    const moveLayerForward = (id: string) => {
        setElements((prev) => {
            const i = prev.findIndex((e) => e.id === id)
            if (i < 0 || i >= prev.length - 1) return prev
            const next = [...prev]
            ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
            return next
        })
    }

    const moveLayerBackward = (id: string) => {
        setElements((prev) => {
            const i = prev.findIndex((e) => e.id === id)
            if (i <= 0) return prev
            const next = [...prev]
            ;[next[i], next[i - 1]] = [next[i - 1], next[i]]
            return next
        })
    }

    const moveBoundFieldOrder = (id: BoundFieldId, direction: "up" | "down") => {
        setElements((prev) => {
            const boundIndices = prev.map((e, idx) => (isBoundFieldId(e.id) ? idx : -1)).filter((idx) => idx >= 0)
            const myIdx = prev.findIndex((e) => e.id === id)
            const pos = boundIndices.indexOf(myIdx)
            if (pos === -1) return prev
            const swapPos = direction === "up" ? pos - 1 : pos + 1
            if (swapPos < 0 || swapPos >= boundIndices.length) return prev
            const iA = boundIndices[pos]
            const iB = boundIndices[swapPos]
            const next = [...prev]
            ;[next[iA], next[iB]] = [next[iB], next[iA]]
            return next
        })
    }

    const restackProductFields = () => {
        setElements((prev) => {
            const margin = 1.2
            let cy = margin
            const copy = prev.map((e) => ({ ...e }))
            for (let i = 0; i < copy.length; i++) {
                const el = copy[i]
                if (!isBoundFieldId(el.id) || !el.isVisible) continue
                const h = Math.max(2, Math.min(el.height, height - cy - margin))
                const y = Math.min(cy, height - h - margin)
                copy[i] = { ...el, y, height: h }
                cy = y + h + 0.6
            }
            return copy
        })
    }

    const renderPreviewElement = (el: LabelElement, stackIndex: number) => {
        if (!el.isVisible) return null

        const isSelected = selectedElementId === el.id
        
        return (
            <div
                key={el.id}
                onMouseDown={(e) => handleMouseDown(e, el)}
                style={{
                    position: 'absolute',
                    transform: `rotate(${el.rotation || 0}deg)`,
                    transformOrigin: 'center center',
                    left: `${mmToPx(el.x)}px`,
                    top: `${mmToPx(el.y)}px`,
                    width: `${mmToPx(el.width)}px`,
                    height: `${mmToPx(el.height)}px`,
                    cursor: draggingId ? 'grabbing' : 'grab',
                    border: isSelected ? '1px dashed #4f46e5' : '1px solid transparent',
                    boxSizing: 'border-box',
                    zIndex: 20 + stackIndex + (isSelected ? 500 : 0),
                    userSelect: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: el.textAlign === 'center' ? 'center' : el.textAlign === 'right' ? 'flex-end' : 'flex-start',
                    textAlign: el.textAlign,
                    overflow: (el.type === 'circle' || el.type === 'rectangle') ? 'visible' : 'hidden',
                }}
                className={isSelected ? 'bg-indigo-50/10' : ''}
            >
                {el.type === 'rectangle' ? (
                    <div className="w-full h-full border border-black" />
                ) : el.type === 'circle' ? (
                    <div className="w-full h-full border border-black rounded-full" />
                ) : el.type === 'image' ? (
                    el.content ? (
                        <img
                            src={el.content}
                            alt="product"
                            className="w-full h-full object-cover border border-slate-300 rounded bg-white"
                            draggable={false}
                            onError={(e) => {
                                e.currentTarget.style.display = "none"
                            }}
                        />
                    ) : (
                        <div className="w-full h-full border border-dashed border-slate-300 rounded bg-slate-50 text-[10px] text-slate-400 flex items-center justify-center">
                            IMG
                        </div>
                    )
                ) : el.type === 'qrcode' ? (
                    el.content ? (
                        <canvas
                            id={`preview-qrcode-${el.id}`}
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'contain',
                            }}
                        />
                    ) : (
                        <div className="w-full h-full border border-dashed border-slate-300 bg-slate-50 text-[10px] text-slate-400 flex items-center justify-center">
                            QR
                        </div>
                    )
                ) : el.type === 'barcode' ? (
                    <div className="flex flex-col items-center w-full h-full justify-center">
                        <svg
                            id={`preview-barcode-${el.id}`}
                            style={{
                                maxWidth: `${el.barcodeWidthPercent ?? 100}%`,
                                height: "80%",
                            }}
                        />
                        <span style={{ fontSize: `${getScaledFontSize(el.fontSize)}px` }} className="font-mono mt-0.5 leading-tight">{el.content}</span>
                    </div>
                ) : el.type === 'price' ? (
                    <div style={{ fontSize: `${getScaledFontSize(el.fontSize)}px` }} className="font-bold text-green-700 bg-green-50 px-1 rounded leading-tight">
                        {el.content} SAR
                    </div>
                ) : (
                    <div 
                        style={{ 
                            fontSize: `${getScaledFontSize(el.fontSize)}px`, 
                            fontWeight: el.fontWeight as any,
                            lineHeight: 1.2,
                            width: '100%',
                            whiteSpace: 'pre-wrap'
                        }}
                    >
                        {el.content}
                    </div>
                )}

                {/* Resize Handles */}
                {isSelected && (
                    <>
                        <div 
                            onMouseDown={(e) => handleMouseDown(e, el, 'resize', 'nw')}
                            className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-indigo-600 rounded-full cursor-nw-resize z-[60]"
                        />
                        <div 
                            onMouseDown={(e) => handleMouseDown(e, el, 'resize', 'ne')}
                            className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-indigo-600 rounded-full cursor-ne-resize z-[60]"
                        />
                        <div 
                            onMouseDown={(e) => handleMouseDown(e, el, 'resize', 'sw')}
                            className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-indigo-600 rounded-full cursor-sw-resize z-[60]"
                        />
                        <div 
                            onMouseDown={(e) => handleMouseDown(e, el, 'resize', 'se')}
                            className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-indigo-600 rounded-full cursor-se-resize z-[60]"
                        />
                        <div 
                            onMouseDown={(e) => handleMouseDown(e, el, 'resize', 'e')}
                            className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-2.5 h-2.5 bg-white border-2 border-indigo-600 rounded-full cursor-e-resize z-[60]"
                        />
                        <div 
                            onMouseDown={(e) => handleMouseDown(e, el, 'resize', 'w')}
                            className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-2.5 h-2.5 bg-white border-2 border-indigo-600 rounded-full cursor-w-resize z-[60]"
                        />
                        <div 
                            onMouseDown={(e) => handleMouseDown(e, el, 'resize', 'n')}
                            className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-white border-2 border-indigo-600 rounded-full cursor-n-resize z-[60]"
                        />
                        <div 
                            onMouseDown={(e) => handleMouseDown(e, el, 'resize', 's')}
                            className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-white border-2 border-indigo-600 rounded-full cursor-s-resize z-[60]"
                        />

                        {/* Rotation Handle */}
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 z-[70]">
                            <div 
                                onMouseDown={(e) => handleMouseDown(e, el, 'rotate')}
                                className="w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center cursor-alias shadow-md hover:scale-110 transition-transform"
                                title={bi("تدوير", "Rotate")}
                            >
                                <svg viewBox="0 0 24 24" className="w-3 h-3 text-white fill-current">
                                    <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
                                </svg>
                            </div>
                            <div className="w-0.5 h-3 bg-indigo-600/50" />
                        </div>
                    </>
                )}
            </div>
        )
    }



    const addElement = (type: ElementType) => {
        const newId = `${type}-${Date.now()}`
        const newElement: LabelElement = {
            id: newId,
            type,
            x: 10,
            y: 10,
            width: type === 'barcode' ? 40 : (type === 'rectangle' || type === 'circle') ? 20 : 30,
            height: type === 'barcode' ? 12 : (type === 'rectangle' || type === 'circle') ? 20 : 6,
            content: type === 'barcode' ? "123456789" : type.includes('custom') ? bi("نص جديد", "New text") : "",
            fontSize: type === 'barcode' ? 7 : 10,
            fontWeight: 'normal',
            isVisible: true,
            textAlign: 'center',
            rotation: 0
        }
        setElements([...elements, newElement])
        setSelectedElementId(newId)
    }

    const updateElement = (id: string, updates: Partial<LabelElement>) => {
        setElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } : el))
    }

    const deleteElement = (id: string) => {
        setElements(prev => prev.filter(el => el.id !== id))
        setSelectedElementId(null)
    }

    const openPrintWindow = (html: string) => {
        const printWindow = window.open("", "", "width=900,height=700")
        if (!printWindow) return
        printWindow.document.write(html)
        printWindow.document.close()
    }

    const buildPrintHtml = (
        products: Array<{
            id: string
            productCode: string
            itemNumber: string
            productName: string
            barcode: string
            price: string
            englishName?: string
            image?: string
        }>,
    ) => {
        const buildPrintElement = (el: LabelElement, index: number) => {
            if (!el.isVisible) return ''
            const printFontSize = getScaledFontSize(el.fontSize)
            
            const commonStyle = `position: absolute; left: ${el.x}mm; top: ${el.y}mm; width: ${el.width}mm; height: ${el.height}mm; transform: rotate(${el.rotation || 0}deg); overflow: hidden; display: flex; align-items: center; justify-content: ${el.textAlign === 'center' ? 'center' : el.textAlign === 'right' ? 'flex-end' : 'flex-start'}; text-align: ${el.textAlign};`
            
            if (el.type === 'rectangle') {
                return `<div style="${commonStyle} border: 1px solid black;"></div>`
            }
            if (el.type === 'circle') {
                return `<div style="${commonStyle} border: 1px solid black; border-radius: 50%;"></div>`
            }
            if (el.type === 'image') {
                return el.content
                    ? `<img src="${el.content}" alt="product" style="${commonStyle} object-fit: cover; border: 0.2mm solid #cbd5e1; border-radius: 1mm; background: white;" />`
                    : ''
            }
            if (el.type === 'qrcode') {
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${Math.round(mmToPx(el.width))}x${Math.round(mmToPx(el.height))}&data=${encodeURIComponent(el.content)}`
                return `<div style="${commonStyle}">
                    <img src="${qrUrl}" alt="qr" style="width: 100%; height: 100%; object-fit: contain;" />
                </div>`
            }
            
            if (el.type === 'barcode' || el.type === 'customBarcode') {
                const bw = el.barcodeWidthPercent ?? 100
                return `<div style="${commonStyle} flex-direction: column;">
                    <svg id="barcode-${index}-${el.id}" style="max-width: ${bw}%; width: 100%; height: 80%;"></svg>
                    <div style="font-size: ${printFontSize}px; line-height: 1.2; font-family: monospace;">${el.content}</div>
                </div>`
            }
            
            if (el.type === 'price') {
                return `<div style="${commonStyle} font-size: ${printFontSize}px; line-height: 1.2; font-weight: bold; color: #047857;">${el.content} SAR</div>`
            }
            
            return `<div style="${commonStyle} font-size: ${printFontSize}px; line-height: 1.2; font-weight: ${el.fontWeight}; white-space: pre-wrap;">${el.content}</div>`
        }

        const cardsHtml = products.map((product, pIndex) => {
            // Map product data to elements
            const productElements = elements.map(el => {
                if (el.id === "productImage") return { ...el, content: product.image || "" }
                if (el.id === "nameAr") return { ...el, content: product.productName }
                if (el.id === "nameEn")
                    return {
                        ...el,
                        content: product.englishName || product.productName,
                    }
                if (el.id === "barcode") return { ...el, content: product.barcode || product.productCode }
                if (el.id === "qrcode") return { ...el, content: buildProductViewerUrl(product.productCode || product.barcode || product.itemNumber || "") }
                if (el.id === "internalCode") return { ...el, content: product.itemNumber }
                if (el.id === "price") return { ...el, content: product.price }
                return el
            })
            
            return `
                <div class="label-card">
                    ${productElements.map((el) => buildPrintElement(el, pIndex)).join('')}
                </div>
            `
        }).join('')

        return `
            <!DOCTYPE html>
            <html dir="rtl" lang="ar">
            <head>
                <meta charset="UTF-8">
                <title>${bi("طباعة الملصقات", "Label Printing")}</title>
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;700&display=swap');
                    body {
                        margin: 0;
                        padding: 0;
                        font-family: 'Noto Sans Arabic', Arial, sans-serif;
                    }
                    .label-card {
                        width: ${width}mm;
                        height: ${height}mm;
                        position: relative;
                        background: #fff;
                        page-break-after: always;
                        overflow: hidden;
                    }
                    @page {
                        size: ${width}mm ${height}mm;
                        margin: 0;
                    }
                    @media print {
                        body { background: white; }
                        .label-card { border: none; }
                    }
                </style>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.12.1/JsBarcode.all.min.js"></script>
            </head>
            <body>
                ${cardsHtml}
                <script>
                    const renderBarcodes = () => {
                        ${products.map((p, pIndex) => {
                            const barcodeElements = elements.filter(el => el.type === 'barcode' && el.isVisible)
                            const bcCode = barcodeElements.map(el => {
                                const content = el.id === 'barcode' ? (p.barcode || p.productCode) : el.content
                                const lineW = el.barcodeLineWidth ?? 2
                                return `
                                    try {
                                        JsBarcode('#barcode-${pIndex}-${el.id}', "${content}", {
                                            format: 'CODE128',
                                            width: ${lineW},
                                            height: ${el.height * 3},
                                            margin: 0,
                                            displayValue: false
                                        });
                                    } catch (e) {}
                                `
                            }).join('\n')
                            return bcCode
                        }).join('\n')}
                    }
                    window.onload = () => {
                        renderBarcodes();
                        setTimeout(() => window.print(), 500);
                    }
                </script>
            </body>
            </html>
        `
    }

    const boundFieldLabels: Record<BoundFieldId, string> = {
        title: bi("عنوان الشركة", "Company title"),
        nameAr: bi("الاسم العربي", "Arabic name"),
        nameEn: bi("الاسم الإنجليزي", "English name"),
        barcode: bi("الباركود", "Barcode"),
        internalCode: bi("الكود الداخلي", "Internal code"),
        price: bi("السعر", "Price"),
    }

    const handlePrint = async () => {
        const products = isBulkPrinting && bulkProducts.length > 0
            ? await Promise.all(
                bulkProducts.map(async (product) => {
                    const sourceProduct = allProducts.find((p) => p.id === product.id)
                    return {
                        id: product.id,
                        productCode: product.barcode || product.productCode,
                        itemNumber: product.itemNumber,
                        productName: product.productName || product.productCode,
                        barcode: product.barcode,
                        price: product.price,
                        image: await resolveProductImage(sourceProduct?.id, sourceProduct?.image),
                    }
                }),
            )
            : selectedBatchProducts.length > 0
                ? await Promise.all(
                    selectedBatchProducts.map(async (product) => ({
                        id: product.id,
                        productCode: product.productCode || product.itemNumber || "",
                        itemNumber: product.itemNumber || product.productCode || "",
                        productName: product.productName || product.productCode || "",
                        englishName: product.productName || product.productCode || "",
                        barcode: product.productCode || product.itemNumber || "",
                        price: String(product.price ?? "0.00"),
                        image: await resolveProductImage(product.id, product.image),
                    })),
                )
            : [{
                id: 'single',
                productCode: previewData.barcode,
                itemNumber: previewData.internalCode,
                productName: previewData.fullNameArabic,
                englishName: previewData.fullNameEnglish,
                barcode: previewData.barcode,
                price: elements.find(el => el.id === 'price')?.content || "0.00",
                image: previewData.productImage,
            }]

        openPrintWindow(buildPrintHtml(products))
    }

    return (
        <div className="h-screen bg-slate-50 p-3 sm:p-5 overflow-hidden" dir="rtl">
            <div className="w-full max-w-[98vw] mx-auto h-full flex flex-col gap-4">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-2">
                            <Tag className="w-8 h-8 text-indigo-600" />
                            {bi("مصمم الملصقات", "Label Designer")}
                        </h1>
                        {isBulkPrinting && (
                            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                                <span className="text-sm text-green-600 font-medium">{bi("طباعة جماعية:", "Bulk printing:")}</span>
                                <span className="text-sm text-green-900 mr-2">{bulkProducts.length} {bi("منتج", "products")}</span>
                            </div>
                        )}
                        {!isBulkPrinting && searchParams.get('productName') && (
                            <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-2">
                                <span className="text-sm text-indigo-600 font-medium">{bi("المنتج:", "Product:")}</span>
                                <span className="text-sm text-indigo-900 mr-2">{searchParams.get('productName')}</span>
                                {searchParams.get('productCode') && (
                                    <span className="text-xs text-indigo-500">({searchParams.get('productCode')})</span>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button 
                            variant="outline" 
                            onClick={() => router.push('/')} 
                            className="gap-2"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            {bi("العودة للمنتجات", "Back to products")}
                        </Button>
                        <Button onClick={handlePrint} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
                            <Printer className="w-4 h-4" />
                            {isBulkPrinting
                                ? `${bi("طباعة", "Print")} ${bulkProducts.length} ${bi("ملصق", "labels")}`
                                : selectedBatchProducts.length > 0
                                    ? `${bi("طباعة", "Print")} ${selectedBatchProducts.length} ${bi("ملصق", "labels")}`
                                    : bi('طباعة تجريبية', 'Test print')}
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">

                    {/* Settings Panel */}
                    <Card className="lg:col-span-4 shadow-md h-full min-h-0 flex flex-col">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Layout className="w-5 h-5" />
                                {bi("خصائص الملصق", "Label Properties")}
                            </CardTitle>
                            <CardDescription>{bi("تحكم في حجم ومحتوى الملصق", "Control label size and content")}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6 flex-1 min-h-0 overflow-y-auto pr-1">
                            {/* Element Properties or Global Settings */}
                            {selectedElementId ? (
                                <div className="space-y-4 animate-in fade-in slide-in-from-right-2">
                                    <div className="flex items-center justify-between border-b pb-2">
                                        <Label className="font-bold">{bi("خصائص العنصر", "Element Properties")}</Label>
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            onClick={() => setSelectedElementId(null)}
                                            className="h-7 text-xs"
                                        >
                                            {bi("إغلاق", "Close")}
                                        </Button>
                                    </div>
                                    
                                    {elements.find(el => el.id === selectedElementId) && (
                                        <>
                                            <div className="space-y-2">
                                                <Label className="text-xs">{bi("المحتوى", "Content")}</Label>
                                                <Input 
                                                    value={elements.find(el => el.id === selectedElementId)?.content} 
                                                    onChange={(e) => updateElement(selectedElementId, { content: e.target.value })}
                                                />
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-2">
                                                    <Label className="text-xs">{bi("حجم الخط", "Font size")}</Label>
                                                    <Input 
                                                        type="number"
                                                        value={elements.find(el => el.id === selectedElementId)?.fontSize} 
                                                        onChange={(e) => updateElement(selectedElementId, { fontSize: Number(e.target.value) })}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-xs">{bi("المحاذاة", "Alignment")}</Label>
                                                    <Select 
                                                        value={elements.find(el => el.id === selectedElementId)?.textAlign} 
                                                        onValueChange={(val: any) => updateElement(selectedElementId, { textAlign: val })}
                                                    >
                                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="right">{bi("يمين", "Right")}</SelectItem>
                                                            <SelectItem value="center">{bi("وسط", "Center")}</SelectItem>
                                                            <SelectItem value="left">{bi("يسار", "Left")}</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-2">
                                                    <Label className="text-xs">{bi("العرض", "Width")} (mm)</Label>
                                                    <Input 
                                                        type="number"
                                                        value={elements.find(el => el.id === selectedElementId)?.width} 
                                                        onChange={(e) => updateElement(selectedElementId, { width: Number(e.target.value) })}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-xs">{bi("الارتفاع", "Height")} (mm)</Label>
                                                    <Input 
                                                        type="number"
                                                        value={elements.find(el => el.id === selectedElementId)?.height} 
                                                        onChange={(e) => updateElement(selectedElementId, { height: Number(e.target.value) })}
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <div className="flex justify-between">
                                                    <Label className="text-xs">{bi("التدوير", "Rotation")} ({bi("درجة", "deg")})</Label>
                                                    <span className="text-xs font-mono">{elements.find(el => el.id === selectedElementId)?.rotation || 0}°</span>
                                                </div>
                                                <input 
                                                    type="range"
                                                    min="0"
                                                    max="360"
                                                    step="45"
                                                    value={elements.find(el => el.id === selectedElementId)?.rotation || 0}
                                                    onChange={(e) => updateElement(selectedElementId, { rotation: Number(e.target.value) })}
                                                    className="w-full"
                                                />
                                            </div>

                                            {elements.find((el) => el.id === selectedElementId)?.type === "barcode" && (
                                                <div className="grid grid-cols-2 gap-3 border-t pt-3">
                                                    <div className="space-y-2">
                                                        <Label className="text-xs">{bi("سماكة خط الباركود", "Barcode line width")}</Label>
                                                        <Input
                                                            type="number"
                                                            min={1}
                                                            max={6}
                                                            step={1}
                                                            value={elements.find((el) => el.id === selectedElementId)?.barcodeLineWidth ?? 2}
                                                            onChange={(e) =>
                                                                updateElement(selectedElementId, {
                                                                    barcodeLineWidth: Number(e.target.value),
                                                                })
                                                            }
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label className="text-xs">{bi("عرض الباركود", "Barcode width")} %</Label>
                                                        <Input
                                                            type="number"
                                                            min={20}
                                                            max={100}
                                                            value={elements.find((el) => el.id === selectedElementId)?.barcodeWidthPercent ?? 100}
                                                            onChange={(e) =>
                                                                updateElement(selectedElementId, {
                                                                    barcodeWidthPercent: Number(e.target.value),
                                                                })
                                                            }
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            <div className="grid grid-cols-2 gap-2 border-t pt-3">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="gap-1"
                                                    onClick={() => moveLayerBackward(selectedElementId)}
                                                >
                                                    <Layers className="w-3 h-3" />
                                                    {bi("للخلف", "Backward")}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="gap-1"
                                                    onClick={() => moveLayerForward(selectedElementId)}
                                                >
                                                    {bi("للأمام", "Forward")}
                                                    <Layers className="w-3 h-3" />
                                                </Button>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground">
                                                {bi("الأسهم تحرك العنصر عند التحديد؛ مع الشبكة يتم التقاط الموقع.", "Arrow keys move the selected element; with grid enabled, position snaps.")}
                                            </p>

                                            <div className="pt-2">
                                                <Button 
                                                    variant="destructive" 
                                                    className="w-full gap-2 h-9"
                                                    onClick={() => deleteElement(selectedElementId)}
                                                >
                                                    {bi("حذف العنصر", "Delete Element")}
                                                </Button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="space-y-3 border-b pb-4">
                                        <Label className="font-bold">{bi("قوالب الباركود المحفوظة", "Saved barcode templates")}</Label>
                                        <Select
                                            value={selectedTemplateId || "__none"}
                                            onValueChange={(value) => {
                                                if (value === "__none") return
                                                handleApplyTemplate(value)
                                            }}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder={bi("اختر قالبًا محفوظًا", "Choose a saved template")} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__none">{bi("اختر قالبًا", "Select template")}</SelectItem>
                                                {savedTemplates.map((template) => (
                                                    <SelectItem key={template.id} value={template.id}>
                                                        {template.name} ({template.width}x{template.height}mm)
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
                                            <Input
                                                value={newTemplateName}
                                                onChange={(e) => setNewTemplateName(e.target.value)}
                                                placeholder={bi("اسم القالب مثل: باركود 4x2", "Template name e.g. Barcode 4x2")}
                                            />
                                            <Button
                                                type="button"
                                                onClick={handleSaveTemplate}
                                                disabled={isSavingTemplate}
                                                className="bg-indigo-600 hover:bg-indigo-700"
                                            >
                                                {isSavingTemplate ? bi("جاري الحفظ...", "Saving...") : bi("حفظ قالب", "Save template")}
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="destructive"
                                                disabled={!selectedTemplateId}
                                                onClick={handleDeleteTemplate}
                                            >
                                                {bi("حذف", "Delete")}
                                            </Button>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {bi("القالب يُحفظ في النظام ويُزامَن مع السحابة تلقائيًا، وعند اختياره يتم تطبيقه على المنتج المحدد.", "Template is saved locally and synced to cloud automatically; when selected, it is applied to the chosen product.")}
                                        </p>
                                    </div>

                                    {!isBulkPrinting && (
                                        <div className="space-y-3 border-b pb-4">
                                            <Label className="font-bold">{bi("بحث عن منتج", "Find Product")}</Label>
                                            <Input
                                                placeholder={bi("اسم، كود، أو رقم صنف...", "Name, code, or item number...")}
                                                value={productSearchTerm}
                                                onChange={(e) => setProductSearchTerm(e.target.value)}
                                            />
                                            {searchResults.length > 0 && (
                                                <div className="max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white divide-y">
                                                    {searchResults.map((p) => (
                                                        <div
                                                            key={p.id}
                                                            className="flex items-center gap-2 px-2 py-2"
                                                        >
                                                            <button
                                                                type="button"
                                                                className="flex-1 text-right px-1 py-1 text-sm hover:bg-slate-50 rounded"
                                                                onClick={() => handleSelectProduct(p)}
                                                            >
                                                                <div className="font-medium">{p.productName}</div>
                                                                <div className="text-xs text-muted-foreground font-mono">
                                                                    {p.productCode} · {p.itemNumber}
                                                                </div>
                                                            </button>
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="outline"
                                                                className="gap-1"
                                                                onClick={() => addProductToBatch(p)}
                                                            >
                                                                <Plus className="w-3.5 h-3.5" />
                                                                {bi("إضافة", "Add")}
                                                            </Button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {selectedBatchProducts.length > 0 && (
                                                <div className="rounded-md border p-2 space-y-2 bg-white">
                                                    <div className="flex items-center justify-between">
                                                        <Label className="text-sm font-semibold">
                                                            {bi("قائمة الطباعة الجماعية", "Batch print list")}
                                                        </Label>
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-7"
                                                            onClick={clearBatchProducts}
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5 ml-1" />
                                                            {bi("تفريغ", "Clear")}
                                                        </Button>
                                                    </div>
                                                    <div className="max-h-32 overflow-y-auto space-y-1">
                                                        {selectedBatchProducts.map((p) => (
                                                            <div key={p.id} className="flex items-center justify-between rounded border bg-white px-2 py-1">
                                                                <div className="min-w-0">
                                                                    <div className="text-xs font-medium truncate">{p.productName || p.productCode}</div>
                                                                    <div className="text-[11px] text-muted-foreground font-mono truncate">
                                                                        {p.productCode} · {p.itemNumber}
                                                                    </div>
                                                                </div>
                                                                <Button
                                                                    type="button"
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    className="h-7 text-red-600 hover:text-red-700"
                                                                    onClick={() => removeProductFromBatch(p.id)}
                                                                >
                                                                    {bi("حذف", "Remove")}
                                                                </Button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {!searchParams.get("productName") && (
                                                <Button
                                                    variant="outline"
                                                    type="button"
                                                    onClick={() => router.push("/?from=label-designer")}
                                                    className="w-full gap-2"
                                                >
                                                    <Tag className="w-4 h-4" />
                                                    {bi("اختر من قائمة المنتجات", "Choose from product list")}
                                                </Button>
                                            )}
                                        </div>
                                    )}

                                    {/* Dimensions */}
                                    <div className="space-y-4 border-b pb-4">
                                        <Label className="font-bold">{bi("الأبعاد الكلية", "Overall dimensions")} (mm)</Label>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-xs">{bi("العرض", "Width")}</Label>
                                                <Input
                                                    type="number"
                                                    value={width}
                                                    onChange={(e) => setWidth(Number(e.target.value))}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs">{bi("الارتفاع", "Height")}</Label>
                                                <Input
                                                    type="number"
                                                    value={height}
                                                    onChange={(e) => setHeight(Number(e.target.value))}
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs">{bi("خطوة الشبكة / التقاط المسطرة", "Grid step / ruler snap")} (mm)</Label>
                                            <Input
                                                type="number"
                                                min={1}
                                                max={20}
                                                value={gridSize}
                                                onChange={(e) => setGridSize(Math.max(1, Number(e.target.value) || 5))}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between rounded-md border px-2 py-1.5">
                                            <span className="text-sm">{bi("صورة المنتج داخل الملصق", "Product image on label")}</span>
                                            <Switch
                                                checked={showProductImage}
                                                onCheckedChange={(checked) => {
                                                    setShowProductImage(checked)
                                                    updateElement("productImage", { isVisible: checked })
                                                }}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between rounded-md border px-2 py-1.5">
                                            <span className="text-sm">{bi("إظهار QR للمنتج", "Show product QR")}</span>
                                            <Switch
                                                checked={elements.find((e) => e.id === "qrcode")?.isVisible ?? false}
                                                onCheckedChange={(checked) => {
                                                    updateElement("qrcode", { isVisible: checked })
                                                }}
                                            />
                                        </div>
                                        <div className="space-y-2 rounded-md border px-2 py-2">
                                            <Label className="text-xs">{bi("رابط أساس QR (مهم للجوال)", "QR base URL (required for mobile)")}</Label>
                                            <Input
                                                dir="ltr"
                                                placeholder="https://example.com"
                                                value={qrBaseUrl}
                                                onChange={(e) => setQrBaseUrl(e.target.value)}
                                            />
                                            <p className="text-[11px] text-muted-foreground">
                                                {bi("ضع دومين أو IP يمكن للجوال الوصول له، مثال: https://yourdomain.com", "Use a domain or LAN IP reachable by phone, e.g. https://yourdomain.com")}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-3 border-b pb-4">
                                        <Label className="font-bold">{bi("محتوى الملصق (حقول المنتج)", "Label content (product fields)")}</Label>
                                        <div className="space-y-2">
                                            {BOUND_FIELD_IDS.map((bid) => {
                                                const el = elements.find((e) => e.id === bid)
                                                if (!el) return null
                                                return (
                                                    <div
                                                        key={bid}
                                                        className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
                                                    >
                                                        <span className="text-sm">{boundFieldLabels[bid]}</span>
                                                        <Switch
                                                            checked={el.isVisible}
                                                            onCheckedChange={(c) => updateElement(bid, { isVisible: c })}
                                                        />
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    <div className="space-y-3 border-b pb-4">
                                        <Label className="font-bold">{bi("حجم الخط والباركود", "Fonts and barcode")}</Label>
                                        <div className="space-y-2">
                                            {BOUND_FIELD_IDS.map((bid) => {
                                                const el = elements.find((e) => e.id === bid)
                                                if (!el || el.type === "barcode") return null
                                                return (
                                                    <div key={bid} className="grid grid-cols-[1fr_72px] gap-2 items-center">
                                                        <span className="text-xs text-muted-foreground truncate">
                                                            {boundFieldLabels[bid]}
                                                        </span>
                                                        <Input
                                                            type="number"
                                                            className="h-8"
                                                            min={4}
                                                            max={48}
                                                            value={el.fontSize}
                                                            onChange={(e) =>
                                                                updateElement(bid, { fontSize: Number(e.target.value) })
                                                            }
                                                        />
                                                    </div>
                                                )
                                            })}
                                            {elements.find((e) => e.id === "barcode") && (
                                                <>
                                                    <div className="grid grid-cols-[1fr_72px] gap-2 items-center">
                                                        <span className="text-xs text-muted-foreground">{bi("سماكة خط الباركود", "Barcode line width")}</span>
                                                        <Input
                                                            type="number"
                                                            className="h-8"
                                                            min={1}
                                                            max={6}
                                                            value={elements.find((e) => e.id === "barcode")?.barcodeLineWidth ?? 2}
                                                            onChange={(e) =>
                                                                updateElement("barcode", {
                                                                    barcodeLineWidth: Number(e.target.value),
                                                                })
                                                            }
                                                        />
                                                    </div>
                                                    <div className="grid grid-cols-[1fr_72px] gap-2 items-center">
                                                        <span className="text-xs text-muted-foreground">{bi("عرض الباركود", "Barcode width")} %</span>
                                                        <Input
                                                            type="number"
                                                            className="h-8"
                                                            min={20}
                                                            max={100}
                                                            value={elements.find((e) => e.id === "barcode")?.barcodeWidthPercent ?? 100}
                                                            onChange={(e) =>
                                                                updateElement("barcode", {
                                                                    barcodeWidthPercent: Number(e.target.value),
                                                                })
                                                            }
                                                        />
                                                    </div>
                                                    <div className="grid grid-cols-[1fr_72px] gap-2 items-center">
                                                        <span className="text-xs text-muted-foreground">{bi("حجم خط تحت الباركود", "Barcode text size")}</span>
                                                        <Input
                                                            type="number"
                                                            className="h-8"
                                                            min={4}
                                                            max={20}
                                                            value={elements.find((e) => e.id === "barcode")?.fontSize ?? 7}
                                                            onChange={(e) =>
                                                                updateElement("barcode", { fontSize: Number(e.target.value) })
                                                            }
                                                        />
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-3 border-b pb-4">
                                        <Label className="font-bold">{bi("ترتيب حقول المنتج", "Product field order")}</Label>
                                        <p className="text-xs text-muted-foreground">
                                            {bi("أعلى/أسفل يغيّر ترتيب الطباعة والطبقات؛ زر «تكديس» يعيد توزيع المواضع عمودياً.", "Up/Down changes print and layer order; 'Stack' redistributes positions vertically.")}
                                        </p>
                                        <div className="space-y-1">
                                            {BOUND_FIELD_IDS.map((bid) => {
                                                const el = elements.find((e) => e.id === bid)
                                                if (!el) return null
                                                return (
                                                    <div
                                                        key={bid}
                                                        className="flex items-center justify-between gap-2 rounded border px-2 py-1"
                                                    >
                                                        <span className="text-xs truncate">{boundFieldLabels[bid]}</span>
                                                        <div className="flex gap-1 shrink-0">
                                                            <Button
                                                                type="button"
                                                                size="icon"
                                                                variant="outline"
                                                                className="h-7 w-7"
                                                                onClick={() => moveBoundFieldOrder(bid, "up")}
                                                            >
                                                                <ChevronUp className="w-4 h-4" />
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                size="icon"
                                                                variant="outline"
                                                                className="h-7 w-7"
                                                                onClick={() => moveBoundFieldOrder(bid, "down")}
                                                            >
                                                                <ChevronDown className="w-4 h-4" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            className="w-full"
                                            onClick={() => restackProductFields()}
                                        >
                                            {bi("إعادة تكديس عمودي للحقول الظاهرة", "Vertical restack visible fields")}
                                        </Button>
                                    </div>

                                    {/* Add Elements Toolbar */}
                                    <div className="space-y-3">
                                        <Label className="font-bold">{bi("إضافة عناصر", "Add Elements")}</Label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Button variant="outline" size="sm" onClick={() => addElement('customText')} className="gap-2 justify-start overflow-hidden">
                                                <Type className="w-3.5 h-3.5 flex-shrink-0" /> <span className="truncate">{bi("نص حر", "Free text")}</span>
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => addElement('barcode')} className="gap-2 justify-start overflow-hidden">
                                                <Barcode className="w-3.5 h-3.5 flex-shrink-0" /> <span className="truncate">{bi("باركود", "Barcode")}</span>
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => addElement('rectangle')} className="gap-2 justify-start overflow-hidden">
                                                <Layout className="w-3.5 h-3.5 flex-shrink-0" /> <span className="truncate">{bi("مستطيل", "Rectangle")}</span>
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => addElement('circle')} className="gap-2 justify-start overflow-hidden">
                                                <div className="w-3.5 h-3.5 rounded-full border border-current flex-shrink-0" /> <span className="truncate">{bi("دائرة", "Circle")}</span>
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Preview Panel */}
                    <Card className="lg:col-span-8 shadow-md bg-slate-300 flex flex-col items-center justify-center p-6 sm:p-8 overflow-auto relative h-full min-h-0">
                        {/* Designer Toolbar */}
                        <div className="absolute top-4 right-4 flex items-center gap-2 bg-white/80 p-2 rounded-lg shadow-sm border backdrop-blur-sm z-20">
                            <Button 
                                variant={showRuler ? "default" : "outline"} 
                                size="sm" 
                                onClick={() => setShowRuler(!showRuler)}
                                className="h-8 text-xs gap-1"
                            >
                                {bi("المسطرة", "Ruler")}
                            </Button>
                            <Button 
                                variant={showGrid ? "default" : "outline"} 
                                size="sm" 
                                onClick={() => setShowGrid(!showGrid)}
                                className="h-8 text-xs gap-1"
                            >
                                {bi("الشبكة", "Grid")}
                            </Button>
                            {showGrid && (
                                <Select
                                    value={gridStrength}
                                    onValueChange={(v: "light" | "strong") => setGridStrength(v)}
                                >
                                    <SelectTrigger className="h-8 min-w-[170px] text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="light">{bi("شبكة خفيفة", "Light grid")}</SelectItem>
                                        <SelectItem value="strong">{bi("شبكة قوية", "Strong grid")}</SelectItem>
                                    </SelectContent>
                                </Select>
                            )}
                        </div>

                        {/* Ruler & Canvas Container */}
                        <div className="relative pt-8 pl-8">
                            {/* Horizontal Ruler */}
                            {showRuler && (
                                <div 
                                    className="absolute top-0 left-8 h-8 border-b border-slate-400 bg-slate-100 flex items-end overflow-visible"
                                    style={{ width: mmToPx(width) }}
                                >
                                    {Array.from({ length: Math.ceil(width / 5) + 1 }).map((_, i) => (
                                        <div 
                                            key={i} 
                                            className="absolute bottom-0 border-l border-slate-400"
                                            style={{ left: mmToPx(i * 5), height: i % 2 === 0 ? '100%' : '50%' }}
                                        >
                                            {i % 2 === 0 && (
                                                <span className="absolute top-0 left-1 text-[10px] font-semibold text-slate-700 bg-slate-100 px-0.5 rounded-sm leading-none z-10">
                                                    {i * 5}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Vertical Ruler */}
                            {showRuler && (
                                <div 
                                    className="absolute left-0 top-8 w-8 border-r border-slate-400 bg-slate-100 flex flex-col items-end overflow-visible"
                                    style={{ height: mmToPx(height) }}
                                >
                                    {Array.from({ length: Math.ceil(height / 5) + 1 }).map((_, i) => (
                                        <div 
                                            key={i} 
                                            className="absolute right-0 border-t border-slate-400"
                                            style={{ top: mmToPx(i * 5), width: i % 2 === 0 ? '100%' : '50%' }}
                                        >
                                            {i % 2 === 0 && (
                                                <span className="absolute right-1 -top-[1px] text-[10px] font-semibold text-slate-700 bg-slate-100 px-0.5 rounded-sm leading-none z-10">
                                                    {i * 5}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Canvas */}
                            <div 
                                className="label-canvas-container relative bg-white shadow-2xl overflow-hidden" 
                                style={{ width: mmToPx(width), height: mmToPx(height) }}
                                onClick={() => setSelectedElementId(null)}
                            >
                                {/* Grid Overlay */}
                                {showGrid && (
                                    <div 
                                        className="absolute inset-0 pointer-events-none"
                                        style={{ 
                                            backgroundImage: `
                                                linear-gradient(to right, rgba(71, 85, 105, ${gridStrength === "strong" ? 0.38 : 0.16}) 1px, transparent 1px),
                                                linear-gradient(to bottom, rgba(71, 85, 105, ${gridStrength === "strong" ? 0.38 : 0.16}) 1px, transparent 1px)
                                            `,
                                            backgroundSize: `${mmToPx(gridSize)}px ${mmToPx(gridSize)}px, ${mmToPx(gridSize)}px ${mmToPx(gridSize)}px`
                                        }}
                                    />
                                )}

                                {elements.map((el, idx) => renderPreviewElement(el, idx))}
                            </div>
                        </div>
                    </Card>

                </div>
            </div>
        </div>
    )
}
