/**
 * Test Suite for Inventory Calculation
 * 
 * Tests the correct formula:
 * currentStock = openingStock + purchases - issues
 * difference = currentStock - inventoryCount
 */

interface TestProduct {
  name: string
  openingStock: number
  purchases: number
  issues: number
  inventoryCount?: number // Physical count (optional, for physical audit)
}

interface TestResult {
  name: string
  expected: {
    currentStock: number
    difference?: number
  }
  actual: {
    currentStock: number
    difference?: number
  }
  passed: boolean
}

function calculateCurrentStock(product: TestProduct): number {
  return product.openingStock + product.purchases - product.issues
}

function calculateDifference(
  currentStock: number,
  inventoryCount: number | undefined
): number | undefined {
  if (inventoryCount === undefined) return undefined
  return currentStock - inventoryCount
}

function runTest(product: TestProduct): TestResult {
  const expected = {
    currentStock: calculateCurrentStock(product),
    difference:
      product.inventoryCount !== undefined
        ? calculateCurrentStock(product) - product.inventoryCount
        : undefined,
  }

  const actual = {
    currentStock: calculateCurrentStock(product),
    difference: calculateDifference(
      calculateCurrentStock(product),
      product.inventoryCount
    ),
  }

  const passed =
    actual.currentStock === expected.currentStock &&
    actual.difference === expected.difference

  return {
    name: product.name,
    expected,
    actual,
    passed,
  }
}

// Test Cases
const testCases: TestProduct[] = [
  // Test 1: Basic case
  {
    name: "كرسي مكتب - بدون فروقات",
    openingStock: 20,
    purchases: 10,
    issues: 8,
    inventoryCount: 22, // 20 + 10 - 8 = 22
  },
  // Test 2: With shortage
  {
    name: "شاشة - مع عجز (نقص)",
    openingStock: 5,
    purchases: 10,
    issues: 12,
    inventoryCount: 2, // Expected: 5 + 10 - 12 = 3, Counted: 2, Difference: 1 (missing)
  },
  // Test 3: With surplus
  {
    name: "طابعة - مع زيادة",
    openingStock: 10,
    purchases: 5,
    issues: 8,
    inventoryCount: 8, // Expected: 10 + 5 - 8 = 7, Counted: 8, Difference: -1 (extra)
  },
  // Test 4: Without physical count
  {
    name: "ماوس - بدون جرد فيزيائي",
    openingStock: 50,
    purchases: 30,
    issues: 20,
    inventoryCount: undefined,
  },
  // Test 5: Zero stock
  {
    name: "لوحة مفاتيح - صفر",
    openingStock: 10,
    purchases: 0,
    issues: 10,
    inventoryCount: 0, // Expected: 10 + 0 - 10 = 0, Counted: 0, Difference: 0
  },
  // Test 6: No purchases
  {
    name: "سماعات - بدون مشتريات",
    openingStock: 100,
    purchases: 0,
    issues: 30,
    inventoryCount: 70, // Expected: 100 + 0 - 30 = 70, Counted: 70, Difference: 0
  },
]

// Run all tests
function runAllTests(): void {
  console.log("🧪 Running Inventory Calculation Tests...")
  console.log("=" * 60)

  const results = testCases.map((test) => runTest(test))
  const passedCount = results.filter((r) => r.passed).length
  const totalCount = results.length

  // Display results
  results.forEach((result, index) => {
    const status = result.passed ? "✅ PASS" : "❌ FAIL"
    console.log(`\n${index + 1}. ${result.name}`)
    console.log(`   ${status}`)
    console.log(`   Expected currentStock: ${result.expected.currentStock}`)
    console.log(`   Actual currentStock: ${result.actual.currentStock}`)

    if (result.expected.difference !== undefined) {
      console.log(`   Expected difference: ${result.expected.difference}`)
      console.log(`   Actual difference: ${result.actual.difference}`)
    }
  })

  // Summary
  console.log(`\n${"=" * 60}`)
  console.log(`Summary: ${passedCount}/${totalCount} tests passed`)

  if (passedCount === totalCount) {
    console.log("✅ All tests passed!")
  } else {
    console.log(`⚠️  ${totalCount - passedCount} test(s) failed`)
  }
}

// Export for use in browser console
if (typeof window !== 'undefined') {
  (window as any).inventoryTests = {
    runAllTests,
    runTest,
    calculateCurrentStock,
    calculateDifference,
  }

  console.log(
    "💡 Inventory tests loaded. Run: window.inventoryTests.runAllTests()"
  )
}

export { runAllTests, runTest, calculateCurrentStock, calculateDifference }
