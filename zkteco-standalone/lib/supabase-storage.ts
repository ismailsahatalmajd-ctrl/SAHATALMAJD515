import { createClient } from "@/lib/supabase/client"
import type { Product, Category, Transaction, FinancialSummary, Branch, Unit, Issue, Return, Location } from "./types"

const supabase = createClient()

// Products
export async function getProducts(): Promise<Product[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching products:", error)
    return []
  }

  return data.map(mapProductFromDB) || []
}

export async function addProduct(product: Omit<Product, "id" | "createdAt" | "updatedAt">): Promise<Product | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from("products")
    .insert([mapProductToDB(product)])
    .select()
    .single()

  if (error) {
    console.error("Error adding product:", error)
    return null
  }

  return mapProductFromDB(data)
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<Product | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from("products")
    .update({
      ...mapProductToDB(updates),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single()

  if (error) {
    console.error("Error updating product:", error)
    return null
  }

  return mapProductFromDB(data)
}

export async function deleteProduct(id: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from("products").delete().eq("id", id)

  if (error) {
    console.error("Error deleting product:", error)
    return false
  }

  return true
}

// Categories
export async function getCategories(): Promise<Category[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from("categories").select("*").order("name")

  if (error) {
    console.error("Error fetching categories:", error)
    return []
  }

  return data || []
}

export async function addCategory(category: Omit<Category, "id">): Promise<Category | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from("categories").insert([category]).select().single()

  if (error) {
    console.error("Error adding category:", error)
    return null
  }

  return data
}

export async function updateCategory(id: string, updates: Partial<Category>): Promise<Category | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from("categories").update(updates).eq("id", id).select().single()

  if (error) {
    console.error("Error updating category:", error)
    return null
  }

  return data
}

export async function deleteCategory(id: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from("categories").delete().eq("id", id)

  if (error) {
    console.error("Error deleting category:", error)
    return false
  }

  return true
}

// Branches
export async function getBranches(): Promise<Branch[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from("branches").select("*").order("name")

  if (error) {
    console.error("Error fetching branches:", error)
    return []
  }

  return data.map(mapBranchFromDB) || []
}

export async function addBranch(branch: Omit<Branch, "id" | "createdAt">): Promise<Branch | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from("branches")
    .insert([
      {
        name: branch.name,
        location: branch.location,
        manager: branch.manager,
        phone: branch.phone,
      },
    ])
    .select()
    .single()

  if (error) {
    console.error("Error adding branch:", error)
    return null
  }

  return mapBranchFromDB(data)
}

export async function updateBranch(id: string, updates: Partial<Branch>): Promise<Branch | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from("branches").update(updates).eq("id", id).select().single()

  if (error) {
    console.error("Error updating branch:", error)
    return null
  }

  return mapBranchFromDB(data)
}

export async function deleteBranch(id: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from("branches").delete().eq("id", id)

  if (error) {
    console.error("Error deleting branch:", error)
    return false
  }

  return true
}

// Units
export async function getUnits(): Promise<Unit[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from("units").select("*").order("name")

  if (error) {
    console.error("Error fetching units:", error)
    return []
  }

  return data.map(mapUnitFromDB) || []
}

export async function addUnit(unit: Omit<Unit, "id" | "createdAt">): Promise<Unit | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from("units")
    .insert([
      {
        name: unit.name,
        abbreviation: unit.abbreviation,
      },
    ])
    .select()
    .single()

  if (error) {
    console.error("Error adding unit:", error)
    return null
  }

  return mapUnitFromDB(data)
}

export async function updateUnit(id: string, updates: Partial<Unit>): Promise<Unit | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from("units").update(updates).eq("id", id).select().single()

  if (error) {
    console.error("Error updating unit:", error)
    return null
  }

  return mapUnitFromDB(data)
}

export async function deleteUnit(id: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from("units").delete().eq("id", id)

  if (error) {
    console.error("Error deleting unit:", error)
    return false
  }

  return true
}

// Locations
export async function getLocations(): Promise<Location[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from("locations").select("*").order("name")

  if (error) {
    console.error("Error fetching locations:", error)
    return []
  }

  return data.map(mapLocationFromDB) || []
}

export async function addLocation(location: Omit<Location, "id" | "createdAt">): Promise<Location | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from("locations")
    .insert([
      {
        name: location.name,
        description: location.description,
      },
    ])
    .select()
    .single()

  if (error) {
    console.error("Error adding location:", error)
    return null
  }

  return mapLocationFromDB(data)
}

export async function updateLocation(id: string, updates: Partial<Location>): Promise<Location | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from("locations").update(updates).eq("id", id).select().single()

  if (error) {
    console.error("Error updating location:", error)
    return null
  }

  return mapLocationFromDB(data)
}

export async function deleteLocation(id: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from("locations").delete().eq("id", id)

  if (error) {
    console.error("Error deleting location:", error)
    return false
  }

  return true
}

// Transactions
export async function getTransactions(): Promise<Transaction[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from("transactions").select("*").order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching transactions:", error)
    return []
  }

  return data.map(mapTransactionFromDB) || []
}

export async function addTransaction(transaction: Omit<Transaction, "id" | "createdAt">): Promise<Transaction | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from("transactions")
    .insert([
      {
        product_id: transaction.productId,
        product_name: transaction.productName,
        type: transaction.type,
        quantity: transaction.quantity,
        unit_price: transaction.unitPrice,
        total_amount: transaction.totalAmount,
        notes: transaction.notes,
        created_by: transaction.createdBy,
      },
    ])
    .select()
    .single()

  if (error) {
    console.error("Error adding transaction:", error)
    return null
  }

  // Update product stock based on transaction type
  if (transaction.productId) {
    const { data: product } = await supabase.from("products").select("*").eq("id", transaction.productId).single()

    if (product) {
      let quantityChange = 0
      const updates: Record<string, number | string> = {}

      switch (transaction.type) {
        case "purchase":
          quantityChange = transaction.quantity
          updates.purchases = (product.purchases || 0) + transaction.quantity
          break
        case "sale":
          quantityChange = -transaction.quantity
          updates.issues = (product.issues || 0) + transaction.quantity
          updates.last_activity = new Date().toISOString()
          break
        case "return":
          quantityChange = transaction.quantity
          break
        case "adjustment":
          quantityChange = transaction.quantity
          break
      }

      updates.current_stock = (product.current_stock || 0) + quantityChange
      const currentStock = updates.current_stock as number
      updates.current_stock_value = currentStock * (product.average_price || product.price || 0)
      updates.updated_at = new Date().toISOString()

      await supabase.from("products").update(updates).eq("id", transaction.productId)
    }
  }

  return mapTransactionFromDB(data)
}

// Issues
export async function getIssues(): Promise<Issue[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from("issues")
    .select(`
      *,
      issue_products (*)
    `)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching issues:", error)
    return []
  }

  return data.map(mapIssueFromDB) || []
}

export async function addIssue(issue: Omit<Issue, "id" | "createdAt">): Promise<Issue | null> {
  if (!supabase) return null
  // First create the issue
  const { data: issueData, error: issueError } = await supabase
    .from("issues")
    .insert([
      {
        branch_id: issue.branchId,
        branch_name: issue.branchName,
        total_value: issue.totalValue,
        notes: issue.notes,
        created_by: issue.createdBy,
      },
    ])
    .select()
    .single()

  if (issueError) {
    console.error("Error adding issue:", issueError)
    return null
  }

  // Then add the products
  if (issue.products && issue.products.length > 0) {
    const issueProducts = issue.products.map((p) => ({
      issue_id: issueData.id,
      product_id: p.productId,
      product_name: p.productName,
      product_code: p.productCode,
      quantity: p.quantity,
      unit: p.unit,
      unit_price: p.unitPrice,
      total_price: p.totalPrice,
      image: p.image,
    }))

    const { error: productsError } = await supabase.from("issue_products").insert(issueProducts)

    if (productsError) {
      console.error("Error adding issue products:", productsError)
    }

    // Update product stocks
    for (const p of issue.products) {
      const { data: product } = await supabase.from("products").select("*").eq("id", p.productId).single()

      if (product) {
        await supabase
          .from("products")
          .update({
            issues: (product.issues || 0) + p.quantity,
            current_stock: (product.current_stock || 0) - p.quantity,
            issues_value: (product.issues_value || 0) + p.totalPrice,
            current_stock_value:
              ((product.current_stock || 0) - p.quantity) * (product.average_price || product.price || 0),
            last_activity: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", p.productId)
      }
    }
  }

  return {
    id: issueData.id,
    branchId: issueData.branch_id,
    branchName: issueData.branch_name,
    products: issue.products,
    totalValue: issueData.total_value,
    notes: issueData.notes,
    createdAt: issueData.created_at,
    createdBy: issueData.created_by,
  }
}

export async function updateIssue(id: string, issue: Issue): Promise<Issue | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from("issues")
    .update({
      branch_id: issue.branchId,
      branch_name: issue.branchName,
      total_value: issue.totalValue,
      notes: issue.notes,
      created_by: issue.createdBy,
      extractor_name: issue.extractorName,
      inspector_name: issue.inspectorName,
      status: issue.status || "pending",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single()

  if (error) {
    console.error("Error updating issue:", error)
    return null
  }

  return {
    ...issue,
    id: data.id,
  }
}

export async function deleteIssue(id: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from("issues").delete().eq("id", id)

  if (error) {
    console.error("Error deleting issue:", error)
    return false
  }

  return true
}

// Returns
export async function getReturns(): Promise<Return[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from("returns")
    .select(`
      *,
      return_products (*)
    `)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching returns:", error)
    return []
  }

  return data.map(mapReturnFromDB) || []
}

export async function addReturn(returnData: Omit<Return, "id" | "createdAt">): Promise<Return | null> {
  if (!supabase) return null
  // First create the return
  const { data: returnRecord, error: returnError } = await supabase
    .from("returns")
    .insert([
      {
        branch_id: returnData.branchId,
        branch_name: returnData.branchName,
        total_value: returnData.totalValue,
        notes: returnData.reason,
        created_by: null,
      },
    ])
    .select()
    .single()

  if (returnError) {
    console.error("Error adding return:", returnError)
    return null
  }

  // Then add the products
  if (returnData.products && returnData.products.length > 0) {
    const returnProducts = returnData.products.map((p) => ({
      return_id: returnRecord.id,
      product_id: p.productId,
      product_name: p.productName,
      product_code: p.productCode,
      quantity: p.quantity,
      unit: p.unit,
      unit_price: p.unitPrice,
      total_price: p.totalPrice,
      image: p.image,
    }))

    const { error: productsError } = await supabase.from("return_products").insert(returnProducts)

    if (productsError) {
      console.error("Error adding return products:", productsError)
    }

    // Update product stocks (add back to stock)
    for (const p of returnData.products) {
      const { data: product } = await supabase.from("products").select("*").eq("id", p.productId).single()

      if (product) {
        await supabase
          .from("products")
          .update({
            issues: Math.max(0, (product.issues || 0) - p.quantity),
            current_stock: (product.current_stock || 0) + p.quantity,
            issues_value: Math.max(0, (product.issues_value || 0) - p.totalPrice),
            current_stock_value:
              ((product.current_stock || 0) + p.quantity) * (product.average_price || product.price || 0),
            updated_at: new Date().toISOString(),
          })
          .eq("id", p.productId)
      }
    }
  }

  return {
    id: returnRecord.id,
    issueId: returnData.issueId,
    branchId: returnRecord.branch_id,
    branchName: returnRecord.branch_name,
    products: returnData.products,
    totalValue: returnRecord.total_value,
    reason: returnData.reason,
    createdAt: returnRecord.created_at,
  }
}

export async function deleteReturn(id: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from("returns").delete().eq("id", id)

  if (error) {
    console.error("Error deleting return:", error)
    return false
  }

  return true
}

// Financial Calculations
export async function calculateFinancialSummary(startDate?: Date, endDate?: Date): Promise<FinancialSummary> {
  if (!supabase) {
    return {
      totalPurchases: 0,
      totalSales: 0,
      totalInventoryValue: 0,
      profit: 0,
      period: "Error: No Connection",
    }
  }
  let transactionsQuery = supabase.from("transactions").select("*")

  if (startDate && endDate) {
    transactionsQuery = transactionsQuery
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())
  }

  const { data: transactions } = await transactionsQuery
  const { data: products } = await supabase.from("products").select("*")

  const totalPurchases = (transactions || [])
    .filter((t: { type: string }) => t.type === "purchase")
    .reduce((sum: number, t: { total_amount: number }) => sum + (t.total_amount || 0), 0)

  const totalSales = (transactions || [])
    .filter((t: { type: string }) => t.type === "sale")
    .reduce((sum: number, t: { total_amount: number }) => sum + (t.total_amount || 0), 0)

  const totalInventoryValue = (products || []).reduce(
    (sum: number, p: { current_stock_value: number }) => sum + (p.current_stock_value || 0),
    0,
  )

  const profit = totalSales - totalPurchases

  return {
    totalPurchases,
    totalSales,
    totalInventoryValue,
    profit,
    period: startDate && endDate ? `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}` : "الكل",
  }
}

// Mapping functions to convert between DB and app types
function mapProductFromDB(dbProduct: Record<string, unknown>): Product {
  return {
    id: dbProduct.id as string,
    productCode: (dbProduct.code as string) || (dbProduct.product_code as string) || "",
    itemNumber: (dbProduct.item_number as string) || "",
    location: (dbProduct.location as string) || "",
    productName: (dbProduct.name as string) || (dbProduct.product_name as string) || "",
    quantity: (dbProduct.quantity as number) || 0,
    unit: (dbProduct.unit as string) || "قطعة",
    openingStock: (dbProduct.opening_stock as number) || 0,
    purchases: (dbProduct.purchases as number) || 0,
    issues: (dbProduct.issues as number) || 0,
    inventoryCount: (dbProduct.inventory_count as number) || 0,
    currentStock: (dbProduct.current_stock as number) || 0,
    difference: (dbProduct.difference as number) || 0,
    price: (dbProduct.price as number) || 0,
    averagePrice: (dbProduct.average_price as number) || (dbProduct.price as number) || 0,
    currentStockValue: (dbProduct.current_stock_value as number) || 0,
    issuesValue: (dbProduct.issues_value as number) || 0,
    category: (dbProduct.category as string) || "",
    image: dbProduct.image as string | undefined,
    minStockLimit: dbProduct.min_stock as number | undefined,
    lastActivity: dbProduct.last_activity as string | undefined,
    createdAt: (dbProduct.created_at as string) || new Date().toISOString(),
    updatedAt: (dbProduct.updated_at as string) || new Date().toISOString(),
  }
}

function mapProductToDB(product: Partial<Product>): Record<string, unknown> {
  return {
    code: product.productCode,
    name: product.productName,
    item_number: product.itemNumber,
    location: product.location,
    quantity: product.quantity,
    unit: product.unit,
    opening_stock: product.openingStock,
    purchases: product.purchases,
    issues: product.issues,
    inventory_count: product.inventoryCount,
    current_stock: product.currentStock,
    difference: product.difference,
    price: product.price,
    average_price: product.averagePrice,
    current_stock_value: product.currentStockValue,
    issues_value: product.issuesValue,
    category: product.category,
    image: product.image,
    min_stock: product.minStockLimit,
    last_activity: product.lastActivity,
  }
}

function mapBranchFromDB(dbBranch: Record<string, unknown>): Branch {
  return {
    id: dbBranch.id as string,
    name: dbBranch.name as string,
    location: (dbBranch.location as string) || "",
    manager: dbBranch.manager as string | undefined,
    phone: dbBranch.phone as string | undefined,
    createdAt: (dbBranch.created_at as string) || new Date().toISOString(),
  }
}

function mapUnitFromDB(dbUnit: Record<string, unknown>): Unit {
  return {
    id: dbUnit.id as string,
    name: dbUnit.name as string,
    abbreviation: dbUnit.abbreviation as string,
    createdAt: (dbUnit.created_at as string) || new Date().toISOString(),
  }
}

function mapLocationFromDB(dbLocation: Record<string, unknown>): Location {
  return {
    id: dbLocation.id as string,
    name: dbLocation.name as string,
    description: dbLocation.description as string | undefined,
    createdAt: (dbLocation.created_at as string) || new Date().toISOString(),
  }
}

function mapTransactionFromDB(dbTransaction: Record<string, unknown>): Transaction {
  return {
    id: dbTransaction.id as string,
    productId: dbTransaction.product_id as string,
    productName: dbTransaction.product_name as string,
    type: dbTransaction.type as "purchase" | "sale" | "adjustment" | "return",
    quantity: dbTransaction.quantity as number,
    unitPrice: dbTransaction.unit_price as number,
    totalAmount: dbTransaction.total_amount as number,
    notes: dbTransaction.notes as string | undefined,
    createdAt: (dbTransaction.created_at as string) || new Date().toISOString(),
    createdBy: dbTransaction.created_by as string | undefined,
  }
}

function mapIssueFromDB(dbIssue: Record<string, unknown>): Issue {
  const issueProducts = (dbIssue.issue_products as Record<string, unknown>[]) || []
  return {
    id: dbIssue.id as string,
    branchId: dbIssue.branch_id as string,
    branchName: dbIssue.branch_name as string,
    products: issueProducts.map((p) => ({
      productId: p.product_id as string,
      productCode: p.product_code as string,
      productName: p.product_name as string,
      quantity: p.quantity as number,
      unitPrice: p.unit_price as number,
      totalPrice: p.total_price as number,
      image: p.image as string | undefined,
      unit: p.unit as string | undefined,
    })),
    totalValue: dbIssue.total_value as number,
    notes: dbIssue.notes as string | undefined,
    createdAt: (dbIssue.created_at as string) || new Date().toISOString(),
    createdBy: dbIssue.created_by as string | undefined,
    extractorName: dbIssue.extractor_name as string | undefined,
    inspectorName: dbIssue.inspector_name as string | undefined,
    status: (dbIssue.status as "draft" | "pending" | "delivered") || undefined,
  }
}

function mapReturnFromDB(dbReturn: Record<string, unknown>): Return {
  const returnProducts = (dbReturn.return_products as Record<string, unknown>[]) || []
  return {
    id: dbReturn.id as string,
    issueId: "",
    branchId: dbReturn.branch_id as string,
    branchName: dbReturn.branch_name as string,
    products: returnProducts.map((p) => ({
      productId: p.product_id as string,
      productCode: p.product_code as string,
      productName: p.product_name as string,
      quantity: p.quantity as number,
      unitPrice: p.unit_price as number,
      totalPrice: p.total_price as number,
      image: p.image as string | undefined,
      unit: p.unit as string | undefined,
    })),
    totalValue: dbReturn.total_value as number,
    reason: (dbReturn.notes as string) || "",
    createdAt: (dbReturn.created_at as string) || new Date().toISOString(),
  }
}
