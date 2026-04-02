"use client"

import { useEffect } from "react"
import { convertNumbersToEnglish } from "@/lib/utils"

function shouldSkipElement(el: Element): boolean {
  const tag = el.tagName
  return tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "META" || tag === "LINK"
}

function normalizeTextNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || ""
    const normalized = convertNumbersToEnglish(text)
    if (normalized !== text) node.textContent = normalized
  }
}

function normalizeElement(el: Element) {
  if (shouldSkipElement(el)) return
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.value = convertNumbersToEnglish(el.value)
    if (el.placeholder) el.placeholder = convertNumbersToEnglish(el.placeholder)
  }
  el.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      normalizeTextNode(child)
    }
  })
}

export default function NumberNormalizer() {
  useEffect(() => {
    const root = document.body

    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        normalizeTextNode(node)
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        normalizeElement(node as Element)
      }
      node.childNodes.forEach(walk)
    }

    // Initial normalization
    walk(root)

    // Observe and normalize future changes
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData" && mutation.target) {
          normalizeTextNode(mutation.target)
        }
        mutation.addedNodes.forEach((n) => {
          if (n.nodeType === Node.TEXT_NODE) {
            normalizeTextNode(n)
          } else if (n.nodeType === Node.ELEMENT_NODE) {
            normalizeElement(n as Element)
          }
        })
        if (mutation.target && mutation.target.nodeType === Node.ELEMENT_NODE) {
          normalizeElement(mutation.target as Element)
        }
      }
    })

    observer.observe(root, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [])

  return null
}